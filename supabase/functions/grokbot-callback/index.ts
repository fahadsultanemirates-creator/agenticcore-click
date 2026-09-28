// The one door Grok Bot can knock on.
//
// Grok Bot holds no database credentials and no service role key, so every
// interaction it has with this framework arrives here, carrying a per-job
// token and an HMAC signature over the exact body and a timestamp. The token
// scopes a leak to a single task; the signature stops a captured request
// being replayed later to re-deliver or re-fail one.
//
// Eight actions, and each one moves the job along a line it cannot go back
// up: fetch, accept, progress, upload_url, submit, needs_info, release,
// failed. Anything arriving out of order is refused rather than applied,
// because an agent that submits a job it never accepted is either confused
// or not the agent.

import { supabaseAdmin } from '../_shared/storage.ts';
import { logEvent, markNeedsInfo } from '../_shared/task.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../_shared/hmac.ts';
import { canAct, isKnownAction } from '../_shared/agentJobState.ts';
import {
  WORK_WINDOW_MINUTES,
  fallbackToBuiltIn,
  grokbotConfig,
  jobByToken,
  jobEvent,
  promoteAndDeliver,
  setJobStatus,
  STAGING_BUCKET,
  type AgentJob
} from '../_shared/grokbot.ts';

function deny(message: string, status = 401): Response {
  // Deliberately uninformative to the caller. A precise reason here is a
  // free oracle for guessing tokens and signatures; the detail goes to the
  // log instead.
  console.warn(`grokbot-callback: ${message}`);
  return jsonResponse({ error: 'Not authorized' }, status);
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const config = grokbotConfig();
  if (!config) return jsonResponse({ error: 'Not configured' }, 503);

  // The signature covers these exact bytes, so read them once and parse
  // afterwards -- re-serialising the object would change what is signed.
  const raw = await req.text();
  // The inbound secret, which is not the key we send with -- see the note
  // on CALLBACK_NAMES in grokbot.ts.
  const check = await verify(
    config.callbackSecret,
    req.headers.get(TIMESTAMP_HEADER) ?? req.headers.get(TIMESTAMP_HEADER.toLowerCase()),
    req.headers.get(SIGNATURE_HEADER) ?? req.headers.get(SIGNATURE_HEADER.toLowerCase()),
    raw
  );
  if (!check.ok) return deny(`signature rejected (${check.reason})`);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!token || !action) return jsonResponse({ error: 'token and action are required' }, 400);

  const job = await jobByToken(token);
  if (!job) return deny('unknown job token');

  if (!isKnownAction(action)) return jsonResponse({ error: `Unknown action "${action}"` }, 400);

  // A retry of something that already happened is success, not a conflict.
  //
  // An agent whose connection dropped mid-reply does not know whether we
  // got it, so it sends again. Answering 409 makes a completed step look
  // like a failure and pushes a working agent into the fallback path; the
  // honest answer is "yes, that is done".
  const ALREADY: Partial<Record<typeof action, string[]>> = {
    accept: ['accepted', 'submitted'],
    submit: ['submitted', 'delivered']
  };
  if ((ALREADY[action] ?? []).includes(job.status)) {
    // Repeating an accept should answer the same thing the first one did,
    // deadline included -- an agent that retried because it never saw the
    // reply still needs to know when the work is due.
    return jsonResponse({ ok: true, status: job.status, repeated: true, finishBy: job.work_deadline ?? null });
  }

  if (!canAct(action, job.status)) {
    // Genuinely out of order -- an agent recovering from a crash needs to
    // know the job moved on without it.
    return jsonResponse({ error: `Cannot ${action} a job that is ${job.status}`, status: job.status }, 409);
  }

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, public_id, type, sku, payload, owner_channel_id')
    .eq('id', job.task_id)
    .maybeSingle();
  if (!task) return jsonResponse({ error: 'Task not found' }, 404);

  const payload = (task.payload ?? {}) as Record<string, unknown>;
  await jobEvent(job.id, action, { at: new Date().toISOString() });

  switch (action) {
    // Everything the agent needs to do the work, handed over at the moment
    // of use rather than pushed in the notice.
    case 'fetch': {
      const { data: files } = await supabaseAdmin
        .from('task_files')
        .select('url, file_type')
        .eq('task_id', task.id);
      return jsonResponse({
        ok: true,
        job: { id: job.id, status: job.status, acceptBy: job.accept_deadline, finishBy: job.work_deadline ?? null },
        task: {
          reference: task.public_id,
          sku: task.sku,
          type: task.type,
          brief: payload.description ?? payload.brief ?? '',
          details: payload,
          existingFiles: files ?? []
        }
      });
    }

    case 'accept': {
      // Accepting starts a second clock. Without it a job could be taken
      // and then abandoned, and nothing was watching for that.
      const workDeadline = new Date(Date.now() + WORK_WINDOW_MINUTES * 60_000).toISOString();
      const moved = await setJobStatus(job.id, 'accepted', {
        accepted_at: new Date().toISOString(),
        work_deadline: workDeadline
      });
      // Losing the race to the expiry sweep is not "already done". Saying
      // ok here would leave the agent building something that has already
      // been handed to a built-in worker.
      if (!moved) {
        return jsonResponse({ error: 'This job expired before the acceptance arrived.', status: 'expired' }, 409);
      }

      await logEvent(task.id, 'agent_accepted', 'worker', { agent: job.agent, jobId: job.id, workDeadline });
      return jsonResponse({ ok: true, status: 'accepted', finishBy: workDeadline });
    }

    case 'progress': {
      // Not a status change -- accepted to accepted is refused, and rightly
      // so, which silently threw the note away. A progress note is just a
      // note, so write it as one.
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';
      const { error: noteError } = await supabaseAdmin
        .from('agent_jobs')
        .update({ note, updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', 'accepted');
      if (noteError) console.error(`grokbot-callback: could not record progress on ${job.id}`, noteError);
      return jsonResponse({ ok: true });
    }

    // A one-time upload straight into private staging. Nothing here is
    // visible to the client, and nothing reads this bucket but the promote
    // step -- so a partial or abandoned upload costs nothing.
    case 'upload_url': {
      const filename = String(body.filename ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      if (!filename) return jsonResponse({ error: 'filename is required' }, 400);

      // The agent's own name for the file is its identity. Asking twice for
      // the same one -- a retry after a dropped connection -- has to mean
      // the same file, or the client receives it twice.
      const clientKey = String(body.idempotencyKey ?? filename);

      const { data: existing } = await supabaseAdmin
        .from('agent_job_files')
        .select('storage_path')
        .eq('job_id', job.id)
        .eq('client_key', clientKey)
        .maybeSingle();

      const path = (existing?.storage_path as string | undefined) ?? `${job.id}/${Date.now()}-${filename}`;
      const { data, error } = await supabaseAdmin.storage
        .from(STAGING_BUCKET)
        .createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return jsonResponse({ error: 'Could not create an upload URL' }, 500);

      if (!existing) {
        const { error: insertError } = await supabaseAdmin.from('agent_job_files').insert({
          job_id: job.id,
          storage_path: path,
          client_key: clientKey,
          file_type: typeof body.fileType === 'string' ? body.fileType : null
        });
        // A unique-violation here means two identical requests raced; the
        // other one won and the row exists, which is the outcome we wanted.
        if (insertError && insertError.code !== '23505') {
          return jsonResponse({ error: 'Could not stage that file' }, 500);
        }
      }

      return jsonResponse({ ok: true, uploadUrl: data.signedUrl, token: data.token, path, repeated: !!existing });
    }

    // The only action that reaches the client. Files are copied out of
    // staging together, so a half-uploaded set never appears on a dashboard.
    case 'submit': {
      // If this did not move the job, something else already closed it --
      // the expiry sweep, a release, a racing duplicate. Delivering anyway
      // would hand the client files for a task a built-in worker is already
      // rebuilding, and they would receive the order twice.
      const claimed = await setJobStatus(job.id, 'submitted', { submitted_at: new Date().toISOString() });
      if (!claimed) {
        return jsonResponse(
          { error: 'This job was closed before the submission arrived; it has been re-queued in-house.', status: job.status },
          409
        );
      }

      try {
        const count = await promoteAndDeliver(job, task.public_id as string, task.owner_channel_id as string | null);
        return jsonResponse({ ok: true, delivered: count });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`grokbot-callback: submit failed for job ${job.id}`, err);
        // The agent thinks it is finished and we disagree. The client is
        // still owed a deliverable, so this goes back in-house rather than
        // sitting submitted-but-undelivered.
        await fallbackToBuiltIn(job as AgentJob, task.public_id as string, `Submission could not be accepted: ${reason}`);
        return jsonResponse({ error: reason }, 422);
      }
    }

    case 'needs_info': {
      const question = String(body.question ?? '').slice(0, 2000) || 'The agent needs more information to continue.';
      const closed = await setJobStatus(job.id, 'released', { closed_at: new Date().toISOString(), note: question });
      if (!closed) return jsonResponse({ ok: true, repeated: true });
      await supabaseAdmin.from('tasks').update({ assigned_agent: null }).eq('id', task.id);
      await markNeedsInfo(task.id, question);
      await notifyOwner(`${task.public_id} — Grok Bot needs more information.\n\n${question}`).catch(() => {});
      return jsonResponse({ ok: true });
    }

    // Both of these close the job inside fallbackToBuiltIn, which is the
    // only place allowed to. Setting the status here first is what
    // overwrote it with the stale value and left released jobs open.
    case 'release': {
      const note = String(body.note ?? '').slice(0, 500) || 'The agent released the job.';
      await fallbackToBuiltIn(job as AgentJob, task.public_id as string, note, 'released');
      return jsonResponse({ ok: true });
    }

    case 'failed': {
      const note = String(body.note ?? '').slice(0, 500) || 'The agent reported a failure.';
      await fallbackToBuiltIn(job as AgentJob, task.public_id as string, note, 'failed');
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ error: 'Unhandled action' }, 400);
}

Deno.serve(handleRequest);
