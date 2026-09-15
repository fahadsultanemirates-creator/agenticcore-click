// AgenticCore Click — Telegram owner channel. Unlike .agency's bot, this
// is NOT a public conversational assistant and there is NO manual
// approve/reject gate before generation: website-sourced tasks are
// already wallet-funded at creation time (see submit-task) and queue
// automatically. This bot exists so the owner can watch the queue, inject
// their own test/dogfood tasks (always sorted behind real client tasks,
// never ahead), request a revision, pull a delivered task's files, or ask
// for an owner-only business report on any URL.
//
// Every reply -- whatever triggered it, typed slash command, free-form
// text, or a voice note -- goes out as both a short plain-language text
// message and a short spoken voice note, in whichever of English/Urdu the
// owner last used (see _shared/botMessage.ts). Slash commands are matched
// first for speed/determinism; anything else (free text, or any voice
// transcript, which never contains a literal "/") falls back to Claude-based
// intent classification (_shared/botConversation.ts, shapes: _shared/intent.ts).
//
// Public endpoint (verify_jwt = false in ../../config.toml) -- Telegram
// doesn't send a Supabase JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { listAvatars, listVoices } from '../_shared/heygen.ts';
import { transcribeAudio } from '../_shared/voice.ts';
import { downloadTelegramFile } from '../_shared/telegramApi.ts';
import { uploadClientMedia } from '../_shared/storage.ts';
import { detectLanguage, getOwnerLanguage, setOwnerLanguage, sendBotMessage } from '../_shared/botMessage.ts';
import { converse } from '../_shared/botConversation.ts';
import { expandSku, getSku, CATALOG } from '../_shared/catalog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
// Unset means nobody can use owner commands (fails closed, not open).
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;

const TASK_ID_PATTERN = /AC-CLICK-\d{4}/i;
const NEW_PATTERN = /^\/new(?:@\S+)?\s+(\d{2,3})\s+([\s\S]+)$/i;
const REVISE_PATTERN = /^\/revise(?:@\S+)?\s+(AC-CLICK-\d{4})\s+([\s\S]+)$/i;
const FILES_PATTERN = /^\/files(?:@\S+)?\s+(AC-CLICK-\d{4})\b/i;
const DELIVER_PATTERN = /^\/deliver(?:@\S+)?\s+(AC-CLICK-\d{4})\s+(\S+)$/i;
const QUEUE_PATTERN = /^\/queue(?:@\S+)?$/i;
const HELP_PATTERN = /^\/(start|help)(?:@\S+)?$/i;
const AVATARS_PATTERN = /^\/avatars(?:@\S+)?(?:\s+(\S+))?$/i;
const VOICES_PATTERN = /^\/voices(?:@\S+)?(?:\s+(\S+))?$/i;
const ADDAVATAR_PATTERN = /^\/addavatar(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i;
const ADDVOICE_PATTERN = /^\/addvoice(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i;
const REPORT_PATTERN = /^\/report(?:@\S+)?\s+(\S+)$/i;
const CATALOG_LIST_LIMIT = 15;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isOwner(fromId: number | undefined): boolean {
  return Boolean(OWNER_TELEGRAM_ID) && fromId !== undefined && String(fromId) === OWNER_TELEGRAM_ID;
}

function triggerDispatch(): void {
  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('telegram-webhook: dispatch trigger failed', err));
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

function helpText(): string {
  return [
    'Commands:',
    '/queue — list queued/in-progress tasks',
    '/products — list every product and its number',
    '/new <product number> <brief> — create an owner task (e.g. /new 72 letterhead for agenticcore.agency)',
    '/revise <task id> <note> — re-queue a delivered task for revision',
    "/files <task id> — list a task's deliverable files",
    '/deliver <task id> <url> — manually attach a file and mark delivered',
    "/report <url> — owner-only business report (flaws, improvements, marketing plan)",
    "/avatars [gender] — browse HeyGen's avatar catalog",
    "/voices [language|gender] — browse HeyGen's voice catalog",
    '/addavatar <id> <name> — add an avatar to the client-facing picker',
    '/addvoice <id> <name> — add a voice to the client-facing picker',
    '',
    'Send /products for the numbered list.',
    'You can also just type or speak what you want in plain English or Urdu.'
  ].join('\n');
}

// Website-sourced tasks always sort ahead of owner-sourced ones,
// regardless of age -- the queue priority rule established for .click.
// Sorting the plain `source` text column descending puts 'website' before
// 'owner' (w > o alphabetically), which gives the right order without a
// computed column.
async function handleQueueCommand(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select('public_id, type, subtype, status, source, created_at')
    .in('status', ['queued', 'in_progress', 'needs_info'])
    .order('source', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error('telegram-webhook: /queue query failed', error);
    return 'Could not load the queue right now.';
  }
  if (!data || data.length === 0) {
    return 'Queue is empty.';
  }

  const lines = data.map(
    (t: any) => `${t.public_id} — ${t.type}${t.subtype ? `/${t.subtype}` : ''} [${t.status}] (${t.source})`
  );
  return `Queue (website tasks always ahead of owner tasks):\n\n${lines.join('\n')}`;
}

// `details` holds whatever structured choices the owner actually stated
// (avatarStyle, platforms, docType...), extracted by the classifier -- see
// _shared/botConversation.ts. Merged under the brief so a stated choice
// always beats the worker's own fallback, while an unstated one stays
// absent and lets the worker default it.
function handleProductsCommand(): string {
  const lines = CATALOG.filter((p) => !p.ownerOnly).map((p) => `${p.sku} — ${p.name}`);
  const owner = CATALOG.filter((p) => p.ownerOnly).map((p) => `${p.sku} — ${p.name} (owner only)`);
  return ['Products (order with /new <number> <brief>):', '', ...lines, '', ...owner].join('\n');
}

async function handleNewCommand(
  chatId: number,
  sku: number,
  brief: string,
  referenceFiles?: string[],
  details?: Record<string, unknown>
): Promise<string> {
  // The SKU decides both the task type and the payload discriminator, so a
  // routed number can't produce a task whose type and item disagree.
  const expanded = expandSku(sku, { brief, ...(details ?? {}) });
  if (!expanded) {
    return `Unknown product number ${sku}. Send /products to see the list.`;
  }
  const product = getSku(sku)!;
  const normalizedType = expanded.type;

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
      payload: {
        ...expanded.payload,
        ...(referenceFiles && referenceFiles.length > 0 ? { referenceFiles } : {})
      }
    })
    .select('id')
    .single();

  if (error || !task) {
    console.error('telegram-webhook: /new insert failed', error);
    return 'Could not create that task.';
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    actor: 'owner',
    detail: { type: normalizedType, sku, product: product.name, brief }
  });

  triggerDispatch();
  return `${publicId} queued — ${product.name} (product ${sku}). Owner task, runs after any pending client tasks.`;
}

async function handleDeliverCommand(publicId: string, url: string): Promise<string> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('id, version')
    .eq('public_id', publicId)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: /deliver lookup failed', fetchError);
    return `Could not look up ${publicId}.`;
  }
  if (!task) return `No task found with id ${publicId}.`;

  const { error: fileError } = await supabaseAdmin
    .from('task_files')
    .insert({ task_id: task.id, url, file_type: 'manual', option_index: 1, version: task.version });
  if (fileError) {
    console.error('telegram-webhook: /deliver file insert failed', fileError);
    return `Could not attach that file to ${publicId}.`;
  }

  await supabaseAdmin.from('tasks').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', task.id);
  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'delivered',
    actor: 'owner',
    detail: { url, manual: true }
  });

  return `${publicId} marked delivered with ${url}.`;
}

async function handleReviseCommand(publicId: string, note: string): Promise<string> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('id, status, revisions_used')
    .eq('public_id', publicId)
    .maybeSingle();

  if (fetchError) {
    console.error('telegram-webhook: /revise lookup failed', fetchError);
    return `Could not look up ${publicId}.`;
  }
  if (!task) return `No task found with id ${publicId}.`;
  if (task.status !== 'delivered') {
    return `Can't revise ${publicId} — current status is "${task.status}", not delivered yet.`;
  }

  const { error: updateError } = await supabaseAdmin
    .from('tasks')
    .update({ status: 'queued', revisions_used: task.revisions_used + 1, updated_at: new Date().toISOString() })
    .eq('id', task.id);

  if (updateError) {
    console.error('telegram-webhook: /revise update failed', updateError);
    return `Could not queue a revision for ${publicId}.`;
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'revision_requested',
    actor: 'owner',
    detail: { note }
  });

  triggerDispatch();
  return `${publicId} re-queued for revision #${task.revisions_used + 1}.`;
}

async function handleFilesCommand(publicId: string): Promise<string> {
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, status')
    .eq('public_id', publicId)
    .maybeSingle();

  if (taskError) {
    console.error('telegram-webhook: /files task lookup failed', taskError);
    return `Could not look up ${publicId}.`;
  }
  if (!task) return `No task found with id ${publicId}.`;

  const { data: files, error: filesError } = await supabaseAdmin
    .from('task_files')
    .select('version, option_index, file_type, url')
    .eq('task_id', task.id)
    .order('version', { ascending: false })
    .order('option_index', { ascending: true });

  if (filesError) {
    console.error('telegram-webhook: /files lookup failed', filesError);
    return `Could not load files for ${publicId}.`;
  }
  if (!files || files.length === 0) {
    return `${publicId} has no files yet (status: ${task.status}).`;
  }

  const lines = files.map((f: any) => `v${f.version} #${f.option_index} (${f.file_type}): ${f.url ?? '(no url)'}`);
  return `Files for ${publicId}:\n\n${lines.join('\n')}`;
}

// Browse HeyGen's live catalog to pick candidates for /addavatar --
// picking a good avatar needs a human actually looking at the preview
// image/video, so this just surfaces the raw options rather than
// guessing which ones look professional.
async function handleAvatarsCommand(genderFilter?: string): Promise<string> {
  try {
    let avatars = await listAvatars();
    if (genderFilter) avatars = avatars.filter((a) => a.gender?.toLowerCase() === genderFilter.toLowerCase());
    if (avatars.length === 0) return 'No avatars found.';

    const lines = avatars
      .slice(0, CATALOG_LIST_LIMIT)
      .map((a) => `${a.name} (${a.gender ?? '?'})\nid: ${a.providerId}\npreview: ${a.previewImageUrl ?? a.previewVideoUrl ?? 'none'}`);

    return `HeyGen avatars (showing ${Math.min(avatars.length, CATALOG_LIST_LIMIT)} of ${avatars.length}):\n\n${lines.join('\n\n')}\n\nUse /addavatar <id> <name> to add one to the picker.`;
  } catch (err) {
    console.error('telegram-webhook: /avatars failed', err);
    return 'Could not load HeyGen avatars right now.';
  }
}

async function handleVoicesCommand(filter?: string): Promise<string> {
  try {
    let voices = await listVoices();
    if (filter) {
      const needle = filter.toLowerCase();
      voices = voices.filter((v) => v.language?.toLowerCase().includes(needle) || v.gender?.toLowerCase() === needle);
    }
    if (voices.length === 0) return 'No voices found.';

    const lines = voices
      .slice(0, CATALOG_LIST_LIMIT)
      .map((v) => `${v.name} (${v.language ?? '?'}, ${v.gender ?? '?'})\nid: ${v.providerId}\npreview: ${v.previewAudioUrl ?? 'none'}`);

    return `HeyGen voices (showing ${Math.min(voices.length, CATALOG_LIST_LIMIT)} of ${voices.length}):\n\n${lines.join('\n\n')}\n\nUse /addvoice <id> <name> to add one to the picker.`;
  } catch (err) {
    console.error('telegram-webhook: /voices failed', err);
    return 'Could not load HeyGen voices right now.';
  }
}

async function handleAddCatalogCommand(kind: 'avatar' | 'voice', providerId: string, name: string): Promise<string> {
  const { error } = await supabaseAdmin.from('catalog_options').insert({ kind, provider_id: providerId, name });
  if (error) {
    console.error(`telegram-webhook: /add${kind} failed`, error);
    return `Could not add that ${kind}.`;
  }
  return `Added "${name}" (${providerId}) to the ${kind} picker.`;
}

async function handleReportCommand(chatId: number, url: string): Promise<string> {
  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

  const publicId = await generatePublicId();
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      public_id: publicId,
      source: 'owner',
      type: 'business-report',
      status: 'queued',
      wallet_confirmed: true,
      owner_channel_id: String(chatId),
      payload: { url: normalizedUrl }
    })
    .select('id')
    .single();

  if (error || !task) {
    console.error('telegram-webhook: /report insert failed', error);
    return 'Could not start that business report.';
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    actor: 'owner',
    detail: { type: 'business-report', url: normalizedUrl }
  });

  triggerDispatch();
  return `${publicId} queued — business report for ${normalizedUrl}. I'll send the PDF here once it's ready (usually a few minutes).`;
}

async function routeMessage(chatId: number, text: string, attachmentUrls: string[] = []): Promise<string> {
  if (HELP_PATTERN.test(text)) return helpText();
  if (QUEUE_PATTERN.test(text)) return handleQueueCommand();
  if (/^\/products(?:@\S+)?$/i.test(text)) return handleProductsCommand();

  const newMatch = text.match(NEW_PATTERN);
  if (newMatch) return handleNewCommand(chatId, Number(newMatch[1]), newMatch[2].trim());

  const reviseMatch = text.match(REVISE_PATTERN);
  if (reviseMatch) return handleReviseCommand(reviseMatch[1].toUpperCase(), reviseMatch[2].trim());

  const filesMatch = text.match(FILES_PATTERN);
  if (filesMatch) return handleFilesCommand(filesMatch[1].toUpperCase());

  const deliverMatch = text.match(DELIVER_PATTERN);
  if (deliverMatch) return handleDeliverCommand(deliverMatch[1].toUpperCase(), deliverMatch[2]);

  const addAvatarMatch = text.match(ADDAVATAR_PATTERN);
  if (addAvatarMatch) return handleAddCatalogCommand('avatar', addAvatarMatch[1], addAvatarMatch[2].trim());

  const addVoiceMatch = text.match(ADDVOICE_PATTERN);
  if (addVoiceMatch) return handleAddCatalogCommand('voice', addVoiceMatch[1], addVoiceMatch[2].trim());

  const avatarsMatch = text.match(AVATARS_PATTERN);
  if (avatarsMatch) return handleAvatarsCommand(avatarsMatch[1]);

  const voicesMatch = text.match(VOICES_PATTERN);
  if (voicesMatch) return handleVoicesCommand(voicesMatch[1]);

  const reportMatch = text.match(REPORT_PATTERN);
  if (reportMatch) return handleReportCommand(chatId, reportMatch[1].trim());

  if (TASK_ID_PATTERN.test(text)) {
    return `Unrecognized command. Try /files ${text.match(TASK_ID_PATTERN)![0].toUpperCase()} or /revise <id> <note>.`;
  }

  // Free-form text, a voice transcript, or a photo/document caption -- let
  // the conversational engine figure out what was meant, using real memory
  // of this chat so it can ask a follow-up and resolve it next message.
  const parsed = await converse(String(chatId), text, attachmentUrls);
  switch (parsed.intent) {
    case 'queue':
      return handleQueueCommand();
    case 'help':
      return helpText();
    case 'new':
      return handleNewCommand(chatId, parsed.sku, parsed.brief, parsed.referenceFiles, parsed.details);
    case 'revise':
      return handleReviseCommand(parsed.taskId.toUpperCase(), parsed.note);
    case 'files':
      return handleFilesCommand(parsed.taskId.toUpperCase());
    case 'deliver':
      return handleDeliverCommand(parsed.taskId.toUpperCase(), parsed.url);
    case 'avatars':
      return handleAvatarsCommand(parsed.gender);
    case 'voices':
      return handleVoicesCommand(parsed.filter);
    case 'addavatar':
      return handleAddCatalogCommand('avatar', parsed.id, parsed.name);
    case 'addvoice':
      return handleAddCatalogCommand('voice', parsed.id, parsed.name);
    case 'report':
      return handleReportCommand(chatId, parsed.url);
    case 'ask':
      return parsed.question;
    case 'chat':
      return parsed.reply;
    default:
      return 'Unrecognized command. Send /help for the list.';
  }
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

  if (!chatId) return new Response('ok');

  const fromId = message?.from?.id;
  if (!isOwner(fromId)) {
    // Purely an owner control channel -- not a public assistant (that's
    // Forge, on the dashboard). Reply once so a stray sender isn't left
    // wondering, but do nothing else.
    await sendBotMessage(chatId, 'This bot is for internal use only.', 'en').catch(() => {});
    return new Response('ok');
  }

  let text: string;
  let language: 'en' | 'ur';
  const attachmentUrls: string[] = [];

  try {
    if (message?.voice?.file_id) {
      const audioBytes = await downloadTelegramFile(message.voice.file_id);
      const transcription = await transcribeAudio(audioBytes, 'voice.oga');
      text = transcription.text.trim();
      language = detectLanguage(text);
    } else if (Array.isArray(message?.photo) && message.photo.length > 0) {
      // Telegram sends multiple resolutions -- the last is the largest.
      const largest = message.photo[message.photo.length - 1];
      const bytes = await downloadTelegramFile(largest.file_id);
      const { url } = await uploadClientMedia(`telegram/${chatId}`, `photo-${largest.file_id}.jpg`, bytes, 'image/jpeg');
      attachmentUrls.push(url);
      text = typeof message?.caption === 'string' ? message.caption.trim() : '(sent a photo)';
      language = detectLanguage(text);
    } else if (message?.document?.file_id) {
      const doc = message.document;
      const bytes = await downloadTelegramFile(doc.file_id);
      const { url } = await uploadClientMedia(`telegram/${chatId}`, doc.file_name || `document-${doc.file_id}`, bytes, doc.mime_type || 'application/octet-stream');
      attachmentUrls.push(url);
      text = typeof message?.caption === 'string' ? message.caption.trim() : `(sent a document: ${doc.file_name || 'file'})`;
      language = detectLanguage(text);
    } else if (typeof message?.text === 'string' && message.text.trim()) {
      text = message.text.trim();
      language = detectLanguage(text);
    } else {
      // Not text, voice, photo, or document (sticker, etc.) -- nothing to act on.
      return new Response('ok');
    }
  } catch (err) {
    console.error('telegram-webhook: could not read incoming message', err);
    await sendBotMessage(chatId, 'Could not understand that message. Please try again or type instead.', await getOwnerLanguage()).catch(() => {});
    return new Response('ok');
  }

  await setOwnerLanguage(language);

  let rawReply: string;
  try {
    rawReply = await routeMessage(chatId, text, attachmentUrls);
  } catch (err) {
    console.error('telegram-webhook: command failed', err);
    rawReply = 'Something went wrong handling that.';
  }

  await sendBotMessage(chatId, rawReply, language).catch((err) => console.error('telegram-webhook: sendBotMessage failed', err));

  return new Response('ok');
}

Deno.serve(handleRequest);
