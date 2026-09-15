import { supabaseAdmin } from './storage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export async function logEvent(
  taskId: string,
  eventType: string,
  actor: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabaseAdmin.from('task_events').insert({ task_id: taskId, event_type: eventType, actor, detail });
  if (error) console.error(`logEvent(${eventType}) failed for ${taskId}:`, error);
}

export async function addTaskFile(
  taskId: string,
  file: { url: string; storagePath?: string; fileType: string; optionIndex?: number; version?: number }
): Promise<void> {
  const { error } = await supabaseAdmin.from('task_files').insert({
    task_id: taskId,
    url: file.url,
    storage_path: file.storagePath ?? null,
    file_type: file.fileType,
    option_index: file.optionIndex ?? 1,
    version: file.version ?? 1
  });
  if (error) console.error(`addTaskFile failed for ${taskId}:`, error);
}

// Retries a couple of times on top of the single attempt other writes in
// this file get -- this is the write that actually closes out a task after
// real work (generation, deploy, upload) already happened, so a transient
// "Gateway Timeout" from PostgREST here would otherwise leave a fully
// finished task stuck in in_progress forever (seen in practice against
// this project). Other logging/event writes stay best-effort.
async function setStatus(taskId: string, status: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabaseAdmin.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
    if (!error) return;
    console.error(`setStatus(${status}) attempt ${attempt} failed for ${taskId}:`, error);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
}

export async function markDelivered(taskId: string): Promise<void> {
  await setStatus(taskId, 'delivered');
  await logEvent(taskId, 'delivered', 'worker');
}

export async function markFailed(taskId: string, reason: string): Promise<void> {
  await setStatus(taskId, 'failed');
  await logEvent(taskId, 'failed', 'worker', { reason });
}

export async function markNeedsInfo(taskId: string, reason: string): Promise<void> {
  await setStatus(taskId, 'needs_info');
  await logEvent(taskId, 'needs_info', 'worker', { reason });
}

export async function setProviderJob(taskId: string, providerJobId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('tasks')
    .update({ provider_job_id: providerJobId, updated_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) console.error(`setProviderJob failed for ${taskId}:`, error);
}

// Fire-and-forget nudge to the dispatcher so a freshly queued task doesn't
// have to wait for the cron safety net. Never awaited by callers -- a
// dispatch failure here just means the cron sweep picks it up shortly
// after instead, not a reason to fail the caller's own request.
export function triggerDispatch(): void {
  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('triggerDispatch failed', err));
}
