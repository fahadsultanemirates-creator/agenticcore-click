// Claims queued tasks and hands each one to the supervisor, which decides
// which agent owns it. Called three ways: (1) fired-and-forgotten by
// submit-task/telegram-webhook right after a task is created, so it doesn't
// wait for the cron sweep; (2) the pg_cron safety net (every couple of
// minutes, in case a chain call above got dropped); (3) manually, for
// testing. Processes a small batch per invocation (not the whole backlog) to
// stay well under the function's execution time limit -- each call
// re-triggers itself if it drained a full batch, so a backlog still clears in
// a few seconds via a short chain of calls rather than one long-running loop.
//
// The dispatcher deliberately knows nothing about products. It used to hold a
// task.type -> worker map, which routed on the word a task was filed under
// rather than on what it actually is. That decision now lives in
// _shared/supervisor.ts, in one place, applied to every task from every
// intake -- see the note at the top of that file.
//
// MANUAL MODE. While it is on -- and it is on by default -- this stops one
// step short of generating anything. The task is claimed, validated and
// routed exactly as before, so an unroutable one is still caught and held
// for a question; it is simply not handed to the worker that routing
// chose, and the owner is told instead. Nothing reaches an in-house worker
// or an external agent. See _shared/manualMode.ts.

import { supabaseAdmin } from '../_shared/storage.ts';
import { superviseTask, type SupervisedTask } from '../_shared/supervisor.ts';
import { markNeedsInfo, logEvent } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { manualModeOn } from '../_shared/manualMode.ts';
import { alertNewOrder } from '../_shared/ownerAlerts.ts';
import { emailForUser } from '../_shared/email.ts';
import { calculatePriceUsd } from '../_shared/pricing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_TASKS_PER_INVOCATION = 3;

async function callWorker(functionName: string, taskId: string): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });
  if (!resp.ok) {
    console.error(`dispatcher: ${functionName} responded ${resp.status} for task ${taskId}`, await resp.text().catch(() => ''));
  }
}

// Awaited, not fired and forgotten.
//
// An un-awaited fetch is not a background task here: the isolate can be
// torn down the moment this function returns its response, so the request
// may never leave. A sweep that silently never runs is worse than a slow
// one -- expired jobs would sit until somebody noticed by hand.
async function sweepExternalAgents(): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/worker-grokbot`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
  } catch (err) {
    console.error('dispatcher: external agent sweep failed', err);
  }
}

function retrigger(): void {
  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('dispatcher: retrigger failed', err));
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  // Read once per invocation, not per task: three tasks in a batch cannot
  // meaningfully disagree about it, and three round trips to say so is
  // three round trips wasted.
  const manual = await manualModeOn();

  let processed = 0;

  for (let i = 0; i < MAX_TASKS_PER_INVOCATION; i++) {
    // rpc() has no schema to infer a row shape from, so its result is `{}`
    // and every field access on it is an error under a strict check. The
    // shape is the function's own contract -- claim_next_task returns a
    // tasks row -- so it is stated here rather than left unknown.
    const { data: task, error } = await supabaseAdmin
      .rpc('claim_next_task')
      .maybeSingle<SupervisedTask & { id: string }>();
    if (error) {
      console.error('dispatcher: claim_next_task failed', error);
      break;
    }
    if (!task || !task.id) break;

    const routing = await superviseTask(task);

    // Unroutable: the task is held for a human answer rather than failed
    // outright, because the work is almost always recoverable by naming the
    // service -- and needs_info is the status the client is actually told about.
    if (!routing.agent) {
      console.error(`dispatcher: ${task.public_id} could not be routed -- ${routing.problem}`);
      await markNeedsInfo(task.id, routing.problem ?? 'Could not determine which product this request is.');
      continue;
    }

    if (routing.corrections.length > 0) {
      await logEvent(task.id, 'supervisor_routed', 'supervisor', {
        sku: routing.item?.sku,
        product: routing.item?.name,
        agent: routing.agent,
        corrections: routing.corrections
      });
    }

    // Manual mode: the routing decision is still made and logged -- it is
    // what the task WILL go to when the robots come back -- but the hand-off
    // does not happen. The task stays in_progress, which is honest: a person
    // is working on it.
    if (manual) {
      await logEvent(task.id, 'held_for_owner', 'dispatcher', {
        sku: routing.item?.sku,
        product: routing.item?.name,
        would_route_to: routing.agent
      });
      await alertNewOrder({
        publicId: task.public_id,
        productName: routing.item?.name ?? task.type,
        // Recomputed, not read off the row: the price is not a column --
        // it lives in the created event -- and the function that computes
        // it here is the same one that charged for it.
        priceUsd: calculatePriceUsd(task.type, task.payload ?? {}) ?? 0,
        source: task.source ?? 'website',
        payload: task.payload ?? {},
        clientEmail: task.user_id ? await emailForUser(task.user_id) : null
      });
      processed++;
      continue;
    }

    await callWorker(routing.agent, task.id);
    processed++;
  }

  if (processed === MAX_TASKS_PER_INVOCATION) {
    retrigger();
  }

  // Sweep up hand-offs an external agent never accepted.
  //
  // Skipped in manual mode: nothing has been handed to an external agent,
  // so there is nothing to sweep, and the call is a wasted invocation
  // every two minutes forever.
  //
  // This rides the dispatcher's own cron rather than getting one of its own
  // on purpose. A separate pg_cron entry would have to carry an
  // Authorization header in a committed migration file, and worker-grokbot
  // requires the service role key -- so the schedule would mean writing that
  // key into git. The dispatcher already holds it in its environment and
  // already runs every two minutes, which is well inside the ten-minute
  // window an offer stays open.
  if (!manual) await sweepExternalAgents();

  return jsonResponse({ ok: true, processed, manual });
}

Deno.serve(handleRequest);
