// Handing a task to Grok Bot, and taking the result back safely.
//
// Grok Bot is the first worker we do not run. It has no database
// credentials, no service role key and no access to storage beyond what we
// hand it, which is deliberate: an outside process should be able to do
// exactly one thing -- finish the job it was offered -- and nothing else,
// even if its own machine is compromised.
//
// That constraint shapes everything here:
//
//   - The notice we send is thin. It names the job, the product and the
//     brief, not the client, the account or anything else on the row.
//   - Every callback carries a per-job token and an HMAC signature. The
//     token scopes a leak to one task; the signature stops a replay.
//   - Files land in a private staging bucket and are copied into the public
//     deliverables bucket only when the job is accepted as finished. A
//     half-uploaded file in `deliverables` is a half-finished deliverable on
//     a paying client's dashboard.
//   - Nothing waits forever. A job nobody accepts goes back to a built-in
//     worker, and the owner is told.

import { supabaseAdmin, uploadDeliverable } from './storage.ts';
import { addTaskFile, logEvent, markDelivered } from './task.ts';
import { notifyOwner } from './telegram.ts';
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './hmac.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const STAGING_BUCKET = 'agent-staging';

/** Minutes an offer stays open before it goes back to a built-in worker. */
export const ACCEPT_WINDOW_MINUTES = 10;

// The handoff document says "the two values Fahad already copied" without
// naming the variables, and a wrong guess here fails as a silent 401 rather
// than as an error anybody can read. So accept the plausible spellings and
// say in the log which one was actually found -- the same approach that
// settled the HeyGen voice field, for the same reason.
function firstSecret(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = (Deno.env.get(name) ?? '').trim();
    if (value) return { name, value };
  }
  return null;
}

export interface GrokbotConfig {
  webhookUrl: string;
  /** Authenticates US to Grok Bot: bearer token and signature on the way out. */
  sharedKey: string;
  /** Authenticates GROK BOT to us: the signature on every callback. */
  callbackSecret: string;
  /** Which environment variable each value came from, for the log. */
  from: { url: string; key: string; callback: string };
}

const URL_NAMES = ['GROKBOT_WEBHOOK_URL', 'GROKBOT_URL', 'GROK_BOT_WEBHOOK_URL'];
const KEY_NAMES = ['GROKBOT_WEBHOOK_KEY', 'GROKBOT_KEY', 'GROKBOT_API_KEY', 'GROK_BOT_KEY'];

// A second secret, for the other direction.
//
// One key both ways was simpler and weaker: whoever could read what we send
// could also forge what comes back. Grok Bot asked for a separate callback
// secret and it is right to -- the outbound key is a bearer token it holds
// in full, while this one only ever appears as a signature.
//
// It falls back to the outbound key when unset, so the path still works
// before the second secret is in place, and /routes says plainly which of
// the two is being used.
const CALLBACK_NAMES = ['GROKBOT_CALLBACK_SECRET', 'GROKBOT_CALLBACK_KEY'];

/**
 * Whether the secrets are actually there, without logging and without
 * revealing them.
 *
 * /routes reported "switched ON" while these could still be missing, which
 * is a half-true status: the first real task would have bounced straight
 * back in-house and the reason would only have been in the logs. A status
 * command should be able to fail the whole check, not part of it.
 */
export function grokbotSecretStatus(): {
  url: string | null;
  key: string | null;
  callback: string | null;
  expected: { url: string[]; key: string[]; callback: string[] };
} {
  return {
    url: firstSecret(URL_NAMES)?.name ?? null,
    key: firstSecret(KEY_NAMES)?.name ?? null,
    callback: firstSecret(CALLBACK_NAMES)?.name ?? null,
    expected: { url: URL_NAMES, key: KEY_NAMES, callback: CALLBACK_NAMES }
  };
}

export function grokbotConfig(): GrokbotConfig | null {
  const url = firstSecret(URL_NAMES);
  const key = firstSecret(KEY_NAMES);
  if (!url || !key) {
    console.error(
      `grokbot: not configured (url=${url?.name ?? 'missing'}, key=${key?.name ?? 'missing'}). ` +
        'Expected GROKBOT_WEBHOOK_URL and GROKBOT_WEBHOOK_KEY in Edge Function secrets.'
    );
    return null;
  }
  const callback = firstSecret(CALLBACK_NAMES);
  return {
    webhookUrl: url.value,
    sharedKey: key.value,
    callbackSecret: callback?.value ?? key.value,
    from: { url: url.name, key: key.name, callback: callback?.name ?? `${key.name} (shared, no separate callback secret set)` }
  };
}

export interface AgentJob {
  id: string;
  task_id: string;
  agent: string;
  status: string;
  token: string;
  accept_deadline: string;
  note: string | null;
}

export async function jobEvent(jobId: string, eventType: string, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabaseAdmin.from('agent_job_events').insert({ job_id: jobId, event_type: eventType, detail });
  if (error) console.error(`grokbot: could not record ${eventType} on job ${jobId}`, error);
}

/** A job nobody has accepted yet, with a deadline and its own callback token. */
export async function openJob(taskId: string, agent: string): Promise<AgentJob> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const deadline = new Date(Date.now() + ACCEPT_WINDOW_MINUTES * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('agent_jobs')
    .insert({ task_id: taskId, agent, token, accept_deadline: deadline })
    .select('id, task_id, agent, status, token, accept_deadline, note')
    .single();
  if (error) throw new Error(`Could not open an agent job: ${error.message}`);

  await jobEvent(data.id, 'offered', { agent, deadline });
  return data as AgentJob;
}

export async function jobByToken(token: string): Promise<AgentJob | null> {
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select('id, task_id, agent, status, token, accept_deadline, note')
    .eq('token', token)
    .maybeSingle();
  return (data as AgentJob | null) ?? null;
}

export async function setJobStatus(jobId: string, status: string, patch: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('agent_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...patch })
    .eq('id', jobId);
  if (error) throw new Error(`Could not set job ${jobId} to ${status}: ${error.message}`);
}

export type NoticeType = 'task' | 'revision' | 'cancelled';

/**
 * The thin notice. Deliberately not the task row.
 *
 * Grok Bot is told what to build and how to talk back, and nothing about who
 * ordered it. Everything else it needs, it fetches with its token -- which
 * means access is checked at the moment of use rather than assumed at the
 * moment of sending.
 */
export async function sendNotice(
  config: GrokbotConfig,
  job: AgentJob,
  notice: { type: NoticeType; sku: number | null; product: string; brief: string; publicId: string; note?: string }
): Promise<void> {
  const body = JSON.stringify({
    type: notice.type,
    job: { id: job.id, token: job.token, acceptBy: job.accept_deadline },
    task: { reference: notice.publicId, sku: notice.sku, product: notice.product, brief: notice.brief, note: notice.note },
    callback: `${SUPABASE_URL}/functions/v1/grokbot-callback`
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(config.sharedKey, timestamp, body);

  const resp = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.sharedKey}`,
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signature
    },
    body
  });

  if (!resp.ok) {
    throw new Error(`Grok Bot webhook responded ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
  }
  await jobEvent(job.id, 'notice_sent', { type: notice.type, status: resp.status });
}

/**
 * Staged files become the deliverable, all at once.
 *
 * Copied rather than linked, because staging is private and a client's
 * dashboard reads the public bucket. Nothing is promoted until the agent has
 * said it is finished, so a client never sees a partial upload.
 */
export async function promoteAndDeliver(job: AgentJob, publicId: string, ownerChannelId?: string | null): Promise<number> {
  const { data: staged, error } = await supabaseAdmin
    .from('agent_job_files')
    .select('id, storage_path, file_type')
    .eq('job_id', job.id)
    .order('created_at');
  if (error) throw new Error(`Could not read staged files: ${error.message}`);
  if (!staged || staged.length === 0) throw new Error('The agent submitted the job with no files attached.');

  const { data: task } = await supabaseAdmin.from('tasks').select('version').eq('id', job.task_id).maybeSingle();
  const version = (task?.version as number | undefined) ?? 1;

  let index = 0;
  for (const file of staged) {
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(STAGING_BUCKET)
      .download(file.storage_path as string);
    if (downloadError || !blob) throw new Error(`Could not read staged file ${file.storage_path}: ${downloadError?.message}`);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const name = (file.storage_path as string).split('/').pop() ?? `deliverable-${index + 1}`;
    const { url } = await uploadDeliverable(job.task_id, name, bytes, (file.file_type as string) ?? 'application/octet-stream');

    index++;
    await addTaskFile(job.task_id, { url, fileType: (file.file_type as string) ?? null, optionIndex: index, version });
  }

  await logEvent(job.task_id, 'agent_delivered', 'worker', { agent: job.agent, files: index, jobId: job.id });
  await markDelivered(job.task_id);
  await setJobStatus(job.id, 'delivered', { closed_at: new Date().toISOString() });
  await jobEvent(job.id, 'delivered', { files: index });

  await notifyOwner(`${publicId} delivered by ${job.agent} (${index} file${index === 1 ? '' : 's'}).`).catch(() => {});
  return index;
}

/**
 * Give the task back to a worker we control.
 *
 * Every way an external hand-off can end badly comes here: nobody accepted
 * it, the agent released it, the agent failed it, or it went quiet past its
 * deadline. In all four the client is owed a deliverable and the framework
 * still knows how to make one, so the task simply returns to the queue with
 * its external assignment cleared -- and the owner is told, because a task
 * silently changing hands is how a quality problem becomes a mystery.
 */
export async function fallbackToBuiltIn(job: AgentJob, publicId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from('tasks')
    .update({ assigned_agent: null, status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', job.task_id);

  await setJobStatus(job.id, job.status === 'offered' ? 'expired' : job.status, {
    closed_at: new Date().toISOString(),
    note: reason
  });
  await jobEvent(job.id, 'fell_back', { reason });
  await logEvent(job.task_id, 'agent_fallback', 'worker', { agent: job.agent, reason });

  await notifyOwner(
    `${publicId} came back from ${job.agent} and has been re-queued to a built-in worker.\n\n${reason}`
  ).catch(() => {});
}

/** Jobs that are past their deadline and still nobody's. */
export async function expiredJobs(): Promise<AgentJob[]> {
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select('id, task_id, agent, status, token, accept_deadline, note')
    .eq('status', 'offered')
    .lt('accept_deadline', new Date().toISOString());
  return (data as AgentJob[] | null) ?? [];
}

export { STAGING_BUCKET };
