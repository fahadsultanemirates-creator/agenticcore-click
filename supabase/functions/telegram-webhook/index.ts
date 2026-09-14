// AgenticCore Click — Telegram owner channel. Unlike .agency's bot, this
// is NOT a public conversational assistant and there is NO manual
// approve/reject gate before generation: website-sourced tasks are
// already wallet-funded at creation time (see submit-task) and queue
// automatically. This bot exists so the owner can watch the queue, inject
// their own test/dogfood tasks (always sorted behind real client tasks,
// never ahead), request a revision, or pull a delivered task's files.
// Public endpoint (verify_jwt = false in ../../config.toml) -- Telegram
// doesn't send a Supabase JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
// Unset means nobody can use owner commands (fails closed, not open).
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4000;

const TASK_TYPES = new Set(['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit']);
const TASK_ID_PATTERN = /AC-CLICK-\d{4}/i;
const NEW_PATTERN = /^\/new(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i;
const REVISE_PATTERN = /^\/revise(?:@\S+)?\s+(AC-CLICK-\d{4})\s+([\s\S]+)$/i;
const FILES_PATTERN = /^\/files(?:@\S+)?\s+(AC-CLICK-\d{4})\b/i;
const QUEUE_PATTERN = /^\/queue(?:@\S+)?$/i;
const HELP_PATTERN = /^\/(start|help)(?:@\S+)?$/i;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const truncated = text.length > MAX_TELEGRAM_MESSAGE_LENGTH ? text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '…' : text;

  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncated })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    console.error(`Telegram sendMessage failed (${resp.status}):`, body);
  }
}

function isOwner(fromId: number | undefined): boolean {
  return Boolean(OWNER_TELEGRAM_ID) && fromId !== undefined && String(fromId) === OWNER_TELEGRAM_ID;
}

async function generatePublicId(): Promise<string> {
  const { count } = await supabaseAdmin.from('tasks').select('*', { count: 'exact', head: true });
  const base = (count ?? 0) + 1;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `AC-CLICK-${String(base + attempt).padStart(4, '0')}`;
    const { data: existing } = await supabaseAdmin.from('tasks').select('id').eq('public_id', candidate).maybeSingle();
    if (!existing) return candidate;
  }
  return `AC-CLICK-${String(base).padStart(4, '0')}-${crypto.randomUUID().slice(0, 4)}`;
}

// Website-sourced tasks always sort ahead of owner-sourced ones,
// regardless of age -- the queue priority rule established for .click.
// Sorting the plain `source` text column descending puts 'website' before
// 'owner' (w > o alphabetically), which happens to give the right order
// without a computed column -- verified against live rows below.
async function handleQueueCommand(chatId: number): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('public_id, type, subtype, status, source, created_at')
    .in('status', ['queued', 'in_progress', 'needs_info'])
    .order('source', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error('telegram-webhook: /queue query failed', error);
    await sendTelegramMessage(chatId, 'Could not load the queue right now.');
    return;
  }
  if (!data || data.length === 0) {
    await sendTelegramMessage(chatId, 'Queue is empty.');
    return;
  }

  const lines = data.map(
    (t: any) => `${t.public_id} — ${t.type}${t.subtype ? `/${t.subtype}` : ''} [${t.status}] (${t.source})`
  );
  await sendTelegramMessage(chatId, `Queue (website tasks always ahead of owner tasks):\n\n${lines.join('\n')}`);
}

async function handleNewCommand(chatId: number, type: string, brief: string): Promise<void> {
  const normalizedType = type.toLowerCase();
  if (!TASK_TYPES.has(normalizedType)) {
    await sendTelegramMessage(
      chatId,
      `Unknown type "${type}". Use one of: ${[...TASK_TYPES].join(', ')}\n\nUsage: /new <type> <brief>`
    );
    return;
  }

  const publicId = await generatePublicId();
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      public_id: publicId,
      source: 'owner',
      type: normalizedType,
      status: 'queued',
      wallet_confirmed: true,
      owner_channel_id: String(chatId),
      payload: { brief }
    })
    .select('id')
    .single();

  if (error || !task) {
    console.error('telegram-webhook: /new insert failed', error);
    await sendTelegramMessage(chatId, 'Could not create that task.');
    return;
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    actor: 'owner',
    detail: { type: normalizedType, brief }
  });

  await sendTelegramMessage(chatId, `${publicId} queued (owner task — will run after any pending client tasks).`);
}

async function handleReviseCommand(chatId: number, publicId: string, note: string): Promise<void> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('id, status, revisions_used')
    .eq('public_id', publicId)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: /revise lookup failed', fetchError);
    await sendTelegramMessage(chatId, `Could not look up ${publicId}.`);
    return;
  }
  if (!task) {
    await sendTelegramMessage(chatId, `No task found with id ${publicId}.`);
    return;
  }
  if (task.status !== 'delivered') {
    await sendTelegramMessage(chatId, `Can't revise ${publicId} — current status is "${task.status}", not delivered yet.`);
    return;
  }

  const { error: updateError } = await supabaseAdmin
    .from('tasks')
    .update({ status: 'queued', revisions_used: task.revisions_used + 1, updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (updateError) {
    console.error('telegram-webhook: /revise update failed', updateError);
    await sendTelegramMessage(chatId, `Could not queue a revision for ${publicId}.`);
    return;
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'revision_requested',
    actor: 'owner',
    detail: { note }
  });

  await sendTelegramMessage(chatId, `${publicId} re-queued for revision #${task.revisions_used + 1}.`);
}

async function handleFilesCommand(chatId: number, publicId: string): Promise<void> {
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, status')
    .eq('public_id', publicId)
    .maybeSingle();

  if (taskError) {
    console.error('telegram-webhook: /files task lookup failed', taskError);
    await sendTelegramMessage(chatId, `Could not look up ${publicId}.`);
    return;
  }
  if (!task) {
    await sendTelegramMessage(chatId, `No task found with id ${publicId}.`);
    return;
  }

  const { data: files, error: filesError } = await supabaseAdmin
    .from('task_files')
    .select('version, option_index, file_type, url')
    .eq('task_id', task.id)
    .order('version', { ascending: false })
    .order('option_index', { ascending: true });

  if (filesError) {
    console.error('telegram-webhook: /files lookup failed', filesError);
    await sendTelegramMessage(chatId, `Could not load files for ${publicId}.`);
    return;
  }
  if (!files || files.length === 0) {
    await sendTelegramMessage(chatId, `${publicId} has no files yet (status: ${task.status}).`);
    return;
  }

  const lines = files.map((f: any) => `v${f.version} #${f.option_index} (${f.file_type}): ${f.url ?? '(no url)'}`);
  await sendTelegramMessage(chatId, `Files for ${publicId}:\n\n${lines.join('\n')}`);
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = message?.text;

  // Always ack 200 for anything not handled -- a non-2xx makes Telegram
  // retry the same update repeatedly.
  if (!chatId || typeof text !== 'string' || text.trim() === '') {
    return new Response('ok');
  }

  const fromId = message?.from?.id;
  if (!isOwner(fromId)) {
    // Purely an owner control channel -- not a public assistant (that's
    // Forge, on the dashboard). Reply once so a stray sender isn't left
    // wondering, but do nothing else.
    await sendTelegramMessage(chatId, 'This bot is for internal use only.').catch(() => {});
    return new Response('ok');
  }

  const trimmed = text.trim();

  try {
    if (HELP_PATTERN.test(trimmed)) {
      await sendTelegramMessage(
        chatId,
        [
          'Commands:',
          '/queue — list queued/in-progress tasks',
          '/new <type> <brief> — create an owner task (queues behind client tasks)',
          '/revise <task id> <note> — re-queue a delivered task for revision',
          '/files <task id> — list a task\'s deliverable files',
          '',
          `Valid types: ${[...TASK_TYPES].join(', ')}`
        ].join('\n')
      );
      return new Response('ok');
    }

    if (QUEUE_PATTERN.test(trimmed)) {
      await handleQueueCommand(chatId);
      return new Response('ok');
    }

    const newMatch = trimmed.match(NEW_PATTERN);
    if (newMatch) {
      await handleNewCommand(chatId, newMatch[1], newMatch[2].trim());
      return new Response('ok');
    }

    const reviseMatch = trimmed.match(REVISE_PATTERN);
    if (reviseMatch) {
      await handleReviseCommand(chatId, reviseMatch[1].toUpperCase(), reviseMatch[2].trim());
      return new Response('ok');
    }

    const filesMatch = trimmed.match(FILES_PATTERN);
    if (filesMatch) {
      await handleFilesCommand(chatId, filesMatch[1].toUpperCase());
      return new Response('ok');
    }

    if (TASK_ID_PATTERN.test(trimmed)) {
      await sendTelegramMessage(chatId, `Unrecognized command. Try /files ${trimmed.match(TASK_ID_PATTERN)![0].toUpperCase()} or /revise <id> <note>.`);
      return new Response('ok');
    }

    await sendTelegramMessage(chatId, 'Unrecognized command. Send /help for the list.');
  } catch (err) {
    console.error('telegram-webhook: command failed', err);
    await sendTelegramMessage(chatId, 'Something went wrong handling that command.').catch(() => {});
  }

  return new Response('ok');
}

Deno.serve(handleRequest);
