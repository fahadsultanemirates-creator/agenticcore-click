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

import { supabaseAdmin } from '../_shared/storage.ts';
import { superviseTask } from '../_shared/supervisor.ts';
import { markNeedsInfo, logEvent } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

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

  let processed = 0;

  for (let i = 0; i < MAX_TASKS_PER_INVOCATION; i++) {
    const { data: task, error } = await supabaseAdmin.rpc('claim_next_task').maybeSingle();
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

    await callWorker(routing.agent, task.id);
    processed++;
  }

  if (processed === MAX_TASKS_PER_INVOCATION) {
    retrigger();
  }

  // Sweep up hand-offs an external agent never accepted.
  //
  // This rides the dispatcher's own cron rather than getting one of its own
  // on purpose. A separate pg_cron entry would have to carry an
  // Authorization header in a committed migration file, and worker-grokbot
  // requires the service role key -- so the schedule would mean writing that
  // key into git. The dispatcher already holds it in its environment and
  // already runs every two minutes, which is well inside the ten-minute
  // window an offer stays open.
  await sweepExternalAgents();

  return jsonResponse({ ok: true, processed });
}

Deno.serve(handleRequest);
