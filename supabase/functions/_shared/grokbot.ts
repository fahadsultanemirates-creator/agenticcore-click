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
import { addTaskFile, logEvent, markDelivered, markFailed } from './task.ts';
import { notifyOwner } from './telegram.ts';
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './hmac.ts';
import { isStatus, movesForward } from './agentJobState.ts';
import { type ExternalAgent } from './agentRouting.ts';
import { fileProblem } from './deliverableTypes.ts';
import type { Bytes } from './bytes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const STAGING_BUCKET = 'agent-staging';

/** Minutes an offer stays open before it goes back to a built-in worker. */
export const ACCEPT_WINDOW_MINUTES = 10;

/**
 * Minutes an accepted job has to finish.
 *
 * accept_deadline only governs the offer. Without this a job that was
 * accepted and then went quiet stayed open forever with nothing watching
 * it -- the client waits, the sweep ignores it because it is not 'offered',
 * and nobody finds out until somebody asks.
 */
export const WORK_WINDOW_MINUTES = 45;

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
  work_deadline?: string | null;
  note: string | null;
}

export async function jobEvent(jobId: string, eventType: string, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabaseAdmin.from('agent_job_events').insert({ job_id: jobId, event_type: eventType, detail });
  if (error) console.error(`grokbot: could not record ${eventType} on job ${jobId}`, error);
}

/** A job nobody has accepted yet, with a deadline and its own callback token. */
export async function openJob(taskId: string, agent: ExternalAgent): Promise<AgentJob> {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const deadline = new Date(Date.now() + ACCEPT_WINDOW_MINUTES * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('agent_jobs')
    .insert({ task_id: taskId, agent, token, accept_deadline: deadline })
    .select('id, task_id, agent, status, token, accept_deadline, work_deadline, note')
    .single();
  if (error) throw new Error(`Could not open an agent job: ${error.message}`);

  await jobEvent(data.id, 'offered', { agent, deadline });
  return data as AgentJob;
}

export async function jobByToken(token: string): Promise<AgentJob | null> {
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select('id, task_id, agent, status, token, accept_deadline, work_deadline, note')
    .eq('token', token)
    .maybeSingle();
  return (data as AgentJob | null) ?? null;
}

/**
 * Move a job forward, and only forward.
 *
 * The status is checked in the UPDATE itself rather than read first and
 * written after, because two callbacks arriving together would both pass a
 * read-then-write check and the later one would win. Postgres decides.
 *
 * Returns false when the move was refused, which callers treat as "somebody
 * else already moved it" rather than as an error -- that is exactly what a
 * retried callback looks like.
 */
export async function setJobStatus(jobId: string, status: string, patch: Record<string, unknown> = {}): Promise<boolean> {
  if (!isStatus(status)) throw new Error(`Unknown job status "${status}"`);

  // The statuses this move is legal from, computed here so the condition
  // lives with the rule rather than being spelled out at each call site.
  const from = (['offered', 'accepted', 'submitted'] as const).filter((current) => movesForward(current, status));
  if (from.length === 0) return false;

  const { data, error } = await supabaseAdmin
    .from('agent_jobs')
    .update({ status, updated_at: new Date().toISOString(), ...patch })
    .eq('id', jobId)
    .in('status', from)
    .select('id');
  if (error) throw new Error(`Could not set job ${jobId} to ${status}: ${error.message}`);

  const moved = (data?.length ?? 0) > 0;
  if (!moved) console.warn(`grokbot: refused to move job ${jobId} to ${status} -- it has already moved on`);
  return moved;
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
  // The signature travels in the body as well as the headers.
  //
  // The first live order arrived at Grok Bot with no signature headers at
  // all, while the same request returned 200 -- so something between us
  // strips them, which is ordinary for a webhook relay that forwards only
  // the payload. A signature that a middlebox can silently remove is not a
  // signature; it is a header the recipient has to hope survived.
  //
  // `signedPayload` is the exact string that was signed, carried verbatim.
  // The alternative -- asking the recipient to re-serialise the object and
  // hope their JSON matches ours byte for byte -- makes key order and
  // whitespace part of the security contract, which is how signature
  // verification quietly breaks later.
  //
  // The original fields stay at the root, so nothing that reads the notice
  // today has to change.
  const payload = {
    type: notice.type,
    job: { id: job.id, token: job.token, acceptBy: job.accept_deadline },
    task: { reference: notice.publicId, sku: notice.sku, product: notice.product, brief: notice.brief, note: notice.note },
    callback: `${SUPABASE_URL}/functions/v1/grokbot-callback`
  };

  const signedPayload = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(config.sharedKey, timestamp, signedPayload);

  const body = JSON.stringify({ ...payload, timestamp, signature, signedPayload });

  // Three attempts with backoff. One dropped connection should not cost a
  // client their order and send the task round the fallback path -- and a
  // webhook restarting is ordinary, not exceptional.
  //
  // Only transport failures and 5xx are retried. A 4xx means the notice
  // itself is wrong, and sending it again changes nothing.
  let lastProblem = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Ten seconds. A webhook that accepts the connection and then never
      // answers would otherwise hold this worker open until the platform
      // kills the whole invocation -- and the retry below would never run.
      const resp = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.sharedKey}`,
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature
        },
        body,
        signal: AbortSignal.timeout(10_000)
      });

      if (resp.ok) {
        await jobEvent(job.id, 'notice_sent', { type: notice.type, status: resp.status, attempt });
        return;
      }

      lastProblem = `${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`;
      if (resp.status < 500) break;
    } catch (err) {
      lastProblem = err instanceof Error ? err.message : String(err);
    }

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  await jobEvent(job.id, 'notice_failed', { type: notice.type, problem: lastProblem });
  throw new Error(`Grok Bot webhook did not accept the notice — ${lastProblem}`);
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

  // Read and check EVERY file before publishing ANY of them.
  //
  // Promoting as we go would leave a client looking at two of four files
  // when the third turns out to be a 200 MB video or a type we do not
  // publish -- a half-delivered order that reads as a finished one.
  const ready: { name: string; bytes: Bytes; type: string }[] = [];
  for (const file of staged) {
    const path = file.storage_path as string;
    const { data: blob, error: downloadError } = await supabaseAdmin.storage.from(STAGING_BUCKET).download(path);
    // A row with no object behind it: the agent asked for an upload URL and
    // never used it, then submitted anyway.
    if (downloadError || !blob) throw new Error(`Staged file ${path} was never uploaded (${downloadError?.message ?? 'not found'})`);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const type = ((file.file_type as string) || blob.type || '').trim();
    const problem = fileProblem(type || null, bytes.byteLength);
    if (problem) throw new Error(`Cannot publish ${path}: ${problem}`);

    ready.push({ name: path.split('/').pop() ?? `deliverable-${ready.length + 1}`, bytes, type });
  }

  // Claim the job BEFORE publishing anything.
  //
  // The order used to be publish, mark the task delivered, then close the
  // job -- which leaves a window where the stuck-submission sweep can take
  // the same job, re-queue the task in-house, and the client ends up with
  // the order twice. Closing first makes the claim atomic: whoever wins the
  // UPDATE owns the delivery, and the loser does nothing.
  const claimed = await setJobStatus(job.id, 'delivered', { closed_at: new Date().toISOString() });
  if (!claimed) throw new Error('This job was closed before its files could be published.');

  let index = 0;
  try {
    for (const file of ready) {
      const { url } = await uploadDeliverable(job.task_id, file.name, file.bytes, file.type);
      index++;
      await addTaskFile(job.task_id, { url, fileType: file.type, optionIndex: index, version });
    }
  } catch (err) {
    // The job is already closed as delivered, so nothing else will pick
    // this up. Say so loudly rather than leaving the task in progress with
    // nobody coming for it.
    const reason = err instanceof Error ? err.message : String(err);
    await markFailed(job.task_id, `Publishing the agent's files failed part-way: ${reason}`);
    await notifyOwner(`${publicId} failed while publishing ${job.agent}'s files.\n\n${reason}`).catch(() => {});
    throw err;
  }

  await logEvent(job.task_id, 'agent_delivered', 'worker', { agent: job.agent, files: index, jobId: job.id });
  await markDelivered(job.task_id);
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
export async function fallbackToBuiltIn(
  job: AgentJob,
  publicId: string,
  reason: string,
  endedAs: 'expired' | 'released' | 'failed' = job.status === 'offered' ? 'expired' : 'released'
): Promise<void> {
  // Close the job FIRST. Re-queueing a task whose job is still open is what
  // let a late callback deliver work for a task a built-in worker was
  // already building.
  const closed = await setJobStatus(job.id, endedAs, { closed_at: new Date().toISOString(), note: reason });
  if (!closed) {
    // Somebody already closed it -- a duplicate release, or the sweep and a
    // callback arriving together. The first one did all of this.
    console.warn(`grokbot: job ${job.id} was already closed; not re-queueing again`);
    return;
  }

  // The agent that handed this back must not be offered it again. Clearing
  // assigned_agent alone left the product still routed to them, so the
  // dispatcher handed it straight back: an infinite loop at one webhook
  // call every two minutes.
  await excludeAgent(job.task_id, job.agent);

  await supabaseAdmin
    .from('tasks')
    .update({ assigned_agent: null, status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', job.task_id);

  // Only when they had actually taken it. An unaccepted offer expiring is
  // not news to anybody.
  if (job.status === 'accepted' || job.status === 'submitted') {
    await sendCancelled(job, publicId, reason);
  }

  await jobEvent(job.id, 'fell_back', { reason, endedAs });
  await logEvent(job.task_id, 'agent_fallback', 'worker', { agent: job.agent, reason });

  await notifyOwner(
    `${publicId} came back from ${job.agent} and has been re-queued to a built-in worker.\n\n${reason}`
  ).catch(() => {});
}

/**
 * Tell the agent a job it may still be working on is no longer theirs.
 *
 * Best effort by design: the task has already moved on by the time this is
 * sent, so a failure to deliver the news must not undo that. It exists so
 * an agent is not still rendering something nobody will accept.
 */
export async function sendCancelled(job: AgentJob, publicId: string, reason: string): Promise<void> {
  const config = grokbotConfig();
  if (!config) return;
  await sendNotice(config, job, {
    type: 'cancelled',
    sku: null,
    product: '',
    brief: '',
    publicId,
    note: reason
  }).catch((err) => console.error(`grokbot: could not tell ${job.agent} that ${publicId} was cancelled`, err));
}

/** Record that this agent will not be offered this task again. */
export async function excludeAgent(taskId: string, agent: string): Promise<void> {
  const { data } = await supabaseAdmin.from('tasks').select('excluded_agents').eq('id', taskId).maybeSingle();
  const current = (data?.excluded_agents as string[] | null) ?? [];
  if (current.includes(agent)) return;
  const { error } = await supabaseAdmin
    .from('tasks')
    .update({ excluded_agents: [...current, agent] })
    .eq('id', taskId);
  if (error) console.error(`grokbot: could not exclude ${agent} from task ${taskId}`, error);
}

const JOB_COLUMNS = 'id, task_id, agent, status, token, accept_deadline, work_deadline, note';

/** Offers nobody took. */
export async function expiredJobs(): Promise<AgentJob[]> {
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select(JOB_COLUMNS)
    .eq('status', 'offered')
    .lt('accept_deadline', new Date().toISOString());
  return (data as AgentJob[] | null) ?? [];
}

/** Jobs that were accepted and then went quiet. */
export async function overdueJobs(): Promise<AgentJob[]> {
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select(JOB_COLUMNS)
    .eq('status', 'accepted')
    .not('work_deadline', 'is', null)
    .lt('work_deadline', new Date().toISOString());
  return (data as AgentJob[] | null) ?? [];
}

/**
 * Jobs stuck part-way through being submitted.
 *
 * 'submitted' is meant to last seconds: the callback sets it, promotes the
 * files and closes the job. If promotion throws in a way the handler never
 * catches -- the function timing out mid-upload, the isolate dying -- the
 * job sits submitted with the task neither delivered nor re-queued, and
 * nothing was looking for it. Fifteen minutes is far longer than the step
 * can legitimately take.
 */
export async function stuckSubmissions(): Promise<AgentJob[]> {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from('agent_jobs')
    .select(JOB_COLUMNS)
    .eq('status', 'submitted')
    .lt('updated_at', cutoff);
  return (data as AgentJob[] | null) ?? [];
}

export { STAGING_BUCKET };
