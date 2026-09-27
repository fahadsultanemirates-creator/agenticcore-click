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
import { logEvent, markNeedsInfo, markFailed } from '../_shared/task.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { verify, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../_shared/hmac.ts';
import { canAct, isKnownAction } from '../_shared/agentJobState.ts';
import {
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
  if (!canAct(action, job.status)) {
    // Not an auth failure, so it says so plainly -- an agent recovering from
    // a crash needs to know the job moved on without it.
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
        job: { id: job.id, status: job.status, acceptBy: job.accept_deadline },
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
      await setJobStatus(job.id, 'accepted', { accepted_at: new Date().toISOString() });
      await logEvent(task.id, 'agent_accepted', 'worker', { agent: job.agent, jobId: job.id });
      return jsonResponse({ ok: true, status: 'accepted' });
    }

    case 'progress': {
      const note = typeof body.note === 'string' ? body.note.slice(0, 500) : '';
      await setJobStatus(job.id, 'accepted', { note });
      return jsonResponse({ ok: true });
    }

    // A one-time upload straight into private staging. Nothing here is
    // visible to the client, and nothing reads this bucket but the promote
    // step -- so a partial or abandoned upload costs nothing.
    case 'upload_url': {
      const filename = String(body.filename ?? '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      if (!filename) return jsonResponse({ error: 'filename is required' }, 400);

      const path = `${job.id}/${Date.now()}-${filename}`;
      const { data, error } = await supabaseAdmin.storage.from(STAGING_BUCKET).createSignedUploadUrl(path);
      if (error || !data) return jsonResponse({ error: 'Could not create an upload URL' }, 500);

      await supabaseAdmin.from('agent_job_files').insert({
        job_id: job.id,
        storage_path: path,
        file_type: typeof body.fileType === 'string' ? body.fileType : null
      });

      return jsonResponse({ ok: true, uploadUrl: data.signedUrl, token: data.token, path });
    }

    // The only action that reaches the client. Files are copied out of
    // staging together, so a half-uploaded set never appears on a dashboard.
    case 'submit': {
      await setJobStatus(job.id, 'submitted', { submitted_at: new Date().toISOString() });
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
      await setJobStatus(job.id, 'released', { closed_at: new Date().toISOString(), note: question });
      await supabaseAdmin.from('tasks').update({ assigned_agent: null }).eq('id', task.id);
      await markNeedsInfo(task.id, question);
      await notifyOwner(`${task.public_id} — Grok Bot needs more information.\n\n${question}`).catch(() => {});
      return jsonResponse({ ok: true });
    }

    case 'release': {
      const note = String(body.note ?? '').slice(0, 500) || 'The agent released the job.';
      await setJobStatus(job.id, 'released');
      await fallbackToBuiltIn(job as AgentJob, task.public_id as string, note);
      return jsonResponse({ ok: true });
    }

    case 'failed': {
      const note = String(body.note ?? '').slice(0, 500) || 'The agent reported a failure.';
      await setJobStatus(job.id, 'failed');
      await fallbackToBuiltIn(job as AgentJob, task.public_id as string, note);
      return jsonResponse({ ok: true });
    }
  }

  return jsonResponse({ error: 'Unhandled action' }, 400);
}

Deno.serve(handleRequest);
