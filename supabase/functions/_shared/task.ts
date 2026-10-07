import { supabaseAdmin } from './storage.ts';
import { getSku } from './catalog.ts';
import { queueEmailForUser } from './email.ts';
import { sendBotMessage } from './botMessage.ts';
import {
  sendTelegramAudio,
  sendTelegramDocument,
  sendTelegramPhoto,
  sendTelegramVideo
} from './telegramApi.ts';
import { deliveryHeader, MAX_FILES_TO_CHAT, sendKindFor } from './deliverTo.ts';
import { alertDelivered, alertFailed } from './ownerAlerts.ts';

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
  await notifyTheClient(taskId);
}

// "Your thing is ready" -- the message a client actually waits for, by
// email and, if they have a chat with us, in Telegram.
//
// Here rather than in each worker because every worker ends here, and a
// notification wired into seven call sites is a notification missing from
// the eighth. Owner and dogfood tasks have no user_id and get nothing; the
// owner already hears about those in Telegram.
//
// Both channels, not one or the other, and not chosen by where the order
// came from. Somebody who orders in the chat still gets the email, because
// the email is the copy that survives; somebody who orders on the website
// and has a linked chat still gets the message, because that is where they
// will see it first. Neither is the delivery itself -- the files are in the
// dashboard either way -- so neither failing can fail anything.
async function notifyTheClient(taskId: string): Promise<void> {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('user_id, public_id, sku, type, version')
    .eq('id', taskId)
    .maybeSingle<{
      user_id: string | null;
      public_id: string;
      sku: number | null;
      type: string;
      version: number | null;
    }>();

  if (error) {
    console.error(`markDelivered: could not read ${taskId} to notify`, error);
    return;
  }
  if (!task?.user_id) return;

  const productName = (task.sku == null ? null : getSku(task.sku)?.name) ?? task.type;

  await queueEmailForUser(task.user_id, 'order_delivered', {
    publicId: task.public_id,
    productName
  });

  const { data: link } = await supabaseAdmin
    .from('telegram_accounts')
    .select('chat_id, password_set_at')
    .eq('user_id', task.user_id)
    .maybeSingle<{ chat_id: number; password_set_at: string | null }>();

  if (link?.chat_id) {
    await sendFilesToChat(
      Number(link.chat_id),
      taskId,
      productName,
      task.public_id,
      task.version ?? 1,
      !link.password_set_at
    );
  }

  // And a receipt to the owner. While orders are fulfilled by hand, the
  // person who just did the work has no other way to know the client was
  // actually reached -- the email queues silently and the chat message is
  // sent to somebody else.
  await alertDelivered({
    publicId: task.public_id,
    productName,
    toEmail: true,
    toTelegram: Boolean(link?.chat_id)
  }).catch(() => {});
}

/**
 * One more option, into the chat, with no second announcement.
 *
 * The manual path delivers a five-option logo as five separate /deliver
 * commands. The first marks the task delivered and announces it; each one
 * after is this -- the file, and a line saying which option it is. Running
 * the full markDelivered per file instead sent five emails and re-sent
 * every earlier option alongside each new one.
 *
 * Nothing here can fail the delivery: task_files is already written and the
 * dashboard already has the file.
 */
export async function sendOneFileToClient(
  taskId: string,
  url: string,
  fileType: string,
  optionIndex: number
): Promise<void> {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('user_id, public_id')
    .eq('id', taskId)
    .maybeSingle<{ user_id: string | null; public_id: string }>();

  if (error) {
    console.error(`sendOneFileToClient: could not read ${taskId}`, error);
    return;
  }
  if (!task?.user_id) return;

  const { data: link } = await supabaseAdmin
    .from('telegram_accounts')
    .select('chat_id')
    .eq('user_id', task.user_id)
    .maybeSingle<{ chat_id: number }>();

  if (!link?.chat_id) return;
  const chatId = Number(link.chat_id);

  await sendBotMessage(chatId, `${task.public_id} — option ${optionIndex}.`).catch(() => {});

  const kind = sendKindFor({ fileType, url });
  try {
    if (kind === 'photo') await sendTelegramPhoto(chatId, url);
    else if (kind === 'video') await sendTelegramVideo(chatId, url);
    else if (kind === 'audio') await sendTelegramAudio(chatId, url);
    else await sendTelegramDocument(chatId, url);
  } catch (err) {
    console.error(`sendOneFileToClient: could not send ${url} to ${chatId}`, err);
  }
}

/**
 * The deliverable itself, into the chat.
 *
 * A link to the dashboard is not a delivery for somebody who ordered
 * here: a client who signed up in Telegram has no website password until
 * they claim the account, so "download it from your dashboard" sends
 * exactly the wrong person to a login screen. The same dead end /topup
 * had.
 *
 * So the files go into the chat as files -- a logo as a picture, a
 * brochure as a document, a clip that plays. They are in the dashboard
 * too, which is where they stay: task_files is written before this runs,
 * and nothing here can un-write it. This is the copy they get now; that
 * is the copy they keep.
 */
async function sendFilesToChat(
  chatId: number,
  taskId: string,
  productName: string,
  publicId: string,
  version: number,
  needsClaim: boolean
): Promise<void> {
  // This version only. A revised task keeps every version's files in
  // task_files, and sending all of them would hand the client the thing
  // they asked to have changed alongside the thing they asked for.
  const { data: files, error } = await supabaseAdmin
    .from('task_files')
    .select('url, file_type, option_index')
    .eq('task_id', taskId)
    .eq('version', version)
    .order('option_index', { ascending: true });

  if (error) console.error(`markDelivered: could not read files for ${taskId}`, error);

  const rows = (files ?? []) as { url: string; file_type: string | null; option_index: number | null }[];
  const sendable = rows.filter((f) => typeof f.url === 'string' && f.url.startsWith('http'));

  const header = deliveryHeader({
    productName,
    publicId,
    fileCount: sendable.length,
    needsClaim
  });

  await sendBotMessage(chatId, header).catch((err) =>
    console.error(`markDelivered: Telegram notice failed for ${taskId}`, err)
  );

  // Capped: an image product returns five options, which is five
  // pictures and exactly what they want. Beyond that it is a flood, and
  // the rest are in the dashboard.
  for (const file of sendable.slice(0, MAX_FILES_TO_CHAT)) {
    const kind = sendKindFor({ fileType: file.file_type, url: file.url });
    try {
      if (kind === 'photo') await sendTelegramPhoto(chatId, file.url);
      else if (kind === 'video') await sendTelegramVideo(chatId, file.url);
      else if (kind === 'audio') await sendTelegramAudio(chatId, file.url);
      else await sendTelegramDocument(chatId, file.url);
    } catch (err) {
      // One file failing must not stop the rest, and must not fail the
      // delivery -- the work is done and the dashboard has it.
      console.error(`markDelivered: could not send ${file.url} to ${chatId}`, err);
    }
  }

  if (sendable.length > MAX_FILES_TO_CHAT) {
    await sendBotMessage(
      chatId,
      `That is the first ${MAX_FILES_TO_CHAT} of ${sendable.length}. The rest are in your dashboard.`
    ).catch(() => {});
  }
}

export async function markFailed(taskId: string, reason: string): Promise<void> {
  await setStatus(taskId, 'failed');
  await logEvent(taskId, 'failed', 'worker', { reason });

  // A failure the client's money depends on. It refunds automatically, but
  // the owner should hear about it without reading logs.
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('public_id, sku, type')
    .eq('id', taskId)
    .maybeSingle<{ public_id: string; sku: number | null; type: string }>();

  if (task) {
    await alertFailed({
      publicId: task.public_id,
      productName: (task.sku == null ? null : getSku(task.sku)?.name) ?? task.type,
      reason
    }).catch(() => {});
  }
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
