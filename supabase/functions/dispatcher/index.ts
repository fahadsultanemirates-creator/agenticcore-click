// Claims and routes queued tasks to the right worker. Called three ways:
// (1) fired-and-forgotten by submit-task/telegram-webhook right after a
// task is created, so it doesn't wait for the cron sweep; (2) the pg_cron
// safety net (every couple of minutes, in case a chain call above got
// dropped); (3) manually, for testing. Processes a small batch per
// invocation (not the whole backlog) to stay well under the function's
// execution time limit -- each call re-triggers itself if it drained a
// full batch, so a backlog still clears in a few seconds via a short
// chain of calls rather than one long-running loop.

import { supabaseAdmin } from '../_shared/storage.ts';
import { jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_TASKS_PER_INVOCATION = 3;

const WORKER_BY_TYPE: Record<string, string> = {
  website: 'worker-website',
  image: 'worker-image',
  pdf: 'worker-pdf',
  documents: 'worker-pdf',
  'brand-kit': 'worker-pdf',
  social: 'worker-social',
  video: 'worker-video'
};

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

    const workerName = WORKER_BY_TYPE[task.type];
    if (!workerName) {
      console.error(`dispatcher: no worker mapped for type "${task.type}" (task ${task.public_id})`);
      await supabaseAdmin.from('tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', task.id);
      await supabaseAdmin
        .from('task_events')
        .insert({ task_id: task.id, event_type: 'failed', actor: 'dispatcher', detail: { reason: `No worker for type ${task.type}` } });
      continue;
    }

    await callWorker(workerName, task.id);
    processed++;
  }

  if (processed === MAX_TASKS_PER_INVOCATION) {
    retrigger();
  }

  return jsonResponse({ ok: true, processed });
}

Deno.serve(handleRequest);
