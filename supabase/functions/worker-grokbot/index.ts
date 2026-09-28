// Hands a task to Grok Bot, and sweeps up the ones it never took.
//
// Two jobs in one function because they are the same job seen from both
// ends: offering work, and noticing when an offer was not taken. A built-in
// worker cannot go quiet -- it returns or it throws inside one invocation --
// so neither of these existed until the first worker we do not run.

import { supabaseAdmin } from '../_shared/storage.ts';
import { logEvent, markNeedsInfo } from '../_shared/task.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { requireInternalCaller } from '../_shared/internal.ts';
import { GROKBOT_AGENT } from '../_shared/agentRouting.ts';
import { excludeAgent } from '../_shared/grokbot.ts';
import { resolveSku, specOf } from '../_shared/catalog.ts';
import { missingRequired, infoRequest } from '../_shared/requirements.ts';
import { getBrandProfile, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import {
  fallbackToBuiltIn,
  expiredJobs,
  overdueJobs,
  stuckSubmissions,
  grokbotConfig,
  openJob,
  sendNotice,
  ACCEPT_WINDOW_MINUTES,
  WORK_WINDOW_MINUTES
} from '../_shared/grokbot.ts';

function revisionNotes(payload: Record<string, unknown>): string[] {
  return Array.isArray(payload.revisionNotes) ? (payload.revisionNotes as string[]) : [];
}

function brandUrlFor(payload: Record<string, unknown>): string | null {
  const explicit = typeof payload.url === 'string' ? payload.url : null;
  if (explicit) return normalizeUrl(explicit);
  return extractUrl(String(payload.description ?? payload.brief ?? ''));
}

/**
 * The sweep: offers nobody took.
 *
 * Ten minutes is the whole patience of this path. A task sitting unclaimed
 * is a client waiting, and we have a worker that can do it -- so an offer
 * that goes unanswered is not an error state to investigate later, it is
 * simply a decision to stop waiting.
 */
async function sweepExpired(): Promise<{ unaccepted: number; abandoned: number; stuck: number }> {
  const unaccepted = await expiredJobs();
  for (const job of unaccepted) {
    const { data: task } = await supabaseAdmin.from('tasks').select('public_id').eq('id', job.task_id).maybeSingle();
    await fallbackToBuiltIn(
      job,
      (task?.public_id as string) ?? job.task_id,
      `Not accepted within ${ACCEPT_WINDOW_MINUTES} minutes.`,
      'expired'
    ).catch((err) => console.error(`worker-grokbot: fallback failed for job ${job.id}`, err));
  }

  // Accepted and then silent. The first sweep only looked at offers, so a
  // job that was taken and abandoned stayed open with nobody watching it
  // and the client simply waiting.
  const abandoned = await overdueJobs();
  for (const job of abandoned) {
    const { data: task } = await supabaseAdmin.from('tasks').select('public_id').eq('id', job.task_id).maybeSingle();
    await fallbackToBuiltIn(
      job,
      (task?.public_id as string) ?? job.task_id,
      `Accepted but not delivered within ${WORK_WINDOW_MINUTES} minutes.`,
      'expired'
    ).catch((err) => console.error(`worker-grokbot: fallback failed for job ${job.id}`, err));
  }

  // Submissions that never finished promoting. 'submitted' should last
  // seconds; one that has sat for fifteen minutes means the callback died
  // part-way and nobody else is coming for it.
  const stuck = await stuckSubmissions();
  for (const job of stuck) {
    const { data: task } = await supabaseAdmin.from('tasks').select('public_id').eq('id', job.task_id).maybeSingle();
    await fallbackToBuiltIn(
      job,
      (task?.public_id as string) ?? job.task_id,
      'Submitted but never finished publishing.',
      'failed'
    ).catch((err) => console.error(`worker-grokbot: fallback failed for job ${job.id}`, err));
  }

  return { unaccepted: unaccepted.length, abandoned: abandoned.length, stuck: stuck.length };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  // Only the dispatcher and pg_cron call this. Supabase's own JWT gate would
  // accept the anon key, which ships in the browser bundle.
  const denied = requireInternalCaller(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  // Called with no task: this is the cron sweep.
  if (!body?.taskId) {
    return jsonResponse({ ok: true, swept: await sweepExpired() });
  }

  const taskId = String(body.taskId);
  const { data: task, error } = await supabaseAdmin.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (error || !task) return jsonResponse({ error: 'Task not found' }, 404);

  const payload = (task.payload ?? {}) as Record<string, unknown>;

  try {
    const config = grokbotConfig();
    if (!config) {
      // Configured wrongly is not the client's problem: build it in-house
      // rather than leaving the task in limbo waiting for a secret.
      //
      // Excluded as well as unassigned. Without that the product is still
      // routed here, so the dispatcher hands the task straight back and we
      // arrive at this same missing secret every two minutes, forever.
      await excludeAgent(taskId, GROKBOT_AGENT);
      await supabaseAdmin.from('tasks').update({ assigned_agent: null, status: 'queued' }).eq('id', taskId);
      await notifyOwner(`${task.public_id} could not be sent to Grok Bot -- its webhook secrets are missing. Re-queued in-house.`);
      return jsonResponse({ ok: true, requeued: true });
    }

    // The same requirements gate every built-in worker uses. An outside
    // agent should never be handed a job that we already know cannot be
    // built -- that wastes their time and delays the question the client
    // actually needs to answer.
    const product = resolveSku(task.type, payload);
    const profile = product?.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;
    const missing = missingRequired(specOf(product), payload, profile);
    if (missing.length > 0) {
      const question = infoRequest(product?.name ?? task.type, missing);
      await logEvent(taskId, 'requirements_missing', 'worker', { sku: product?.sku, missing, agent: GROKBOT_AGENT });
      await markNeedsInfo(taskId, question);
      await notifyOwner(`${task.public_id} is missing ${missing.join(', ')} before Grok Bot can build it.\n\n${question}`);
      return jsonResponse({ ok: true, needsInfo: true });
    }

    const job = await openJob(taskId, GROKBOT_AGENT);
    await sendNotice(config, job, {
      type: revisionNotes(payload).length > 0 ? 'revision' : 'task',
      sku: product?.sku ?? null,
      product: product?.name ?? task.type,
      brief: String(payload.description ?? payload.brief ?? ''),
      publicId: task.public_id as string,
      // The latest note, not a field that never existed. Every other worker
      // reads `revisionNotes`; this read `revisionNote`, so a client's
      // revision instructions reached Grok Bot as undefined and it rebuilt
      // the same thing.
      note: revisionNotes(payload).at(-1)
    });

    await logEvent(taskId, 'handed_to_agent', 'worker', {
      agent: GROKBOT_AGENT,
      jobId: job.id,
      acceptBy: job.accept_deadline,
      secretsFrom: config.from
    });

    return jsonResponse({ ok: true, jobId: job.id, acceptBy: job.accept_deadline });
  } catch (err) {
    // A webhook that will not accept the notice is our problem, not the
    // client's: hand the task back to a worker we control rather than
    // failing it.
    console.error(`worker-grokbot failed for ${taskId}:`, err);
    const reason = err instanceof Error ? err.message : String(err);
    const { data: open } = await supabaseAdmin
      .from('agent_jobs')
      .select('id, task_id, agent, status, token, accept_deadline, note')
      .eq('task_id', taskId)
      .eq('status', 'offered')
      .maybeSingle();

    if (open) {
      await fallbackToBuiltIn(open as never, task.public_id as string, `Could not reach Grok Bot: ${reason}`);
    } else {
      // No job row was ever created, so fallbackToBuiltIn has nothing to
      // close -- but the exclusion still has to be recorded, or this task
      // comes back here on the next sweep and fails the same way.
      await excludeAgent(taskId, GROKBOT_AGENT);
      await supabaseAdmin.from('tasks').update({ assigned_agent: null, status: 'queued' }).eq('id', taskId);
      await notifyOwner(`${task.public_id} could not be handed to Grok Bot (${reason}). Re-queued in-house.`).catch(() => {});
    }
    return jsonResponse({ ok: true, requeued: true });
  }
}

Deno.serve(handleRequest);
