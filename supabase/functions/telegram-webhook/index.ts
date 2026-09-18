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
import { downloadTelegramFile, sendTelegramAudio, sendTelegramPhoto, sendTelegramText } from '../_shared/telegramApi.ts';
import { paginate, parseBrowseArgs, browseFooter } from '../_shared/catalogBrowse.ts';
import {
  getVideoDefaults,
  hasDefaultAvatar,
  hasDefaultVoice,
  setDefaultAvatar,
  setDefaultVoice
} from '../_shared/videoDefaults.ts';
import { uploadClientMedia } from '../_shared/storage.ts';
import { detectLanguage, getOwnerLanguage, setOwnerLanguage, sendBotMessage } from '../_shared/botMessage.ts';
import { converse } from '../_shared/botConversation.ts';
import { expandSku, getSku, CATALOG } from '../_shared/catalog.ts';
import { applyRevision, findTaskReference, allocateOwnerTask } from '../_shared/orders.ts';
import { resolveOwnerTaskReference, getPlatformSnapshot, getTaskStatus } from '../_shared/accounts.ts';
import { describeCandidates } from '../_shared/orderMatch.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;
// Unset means nobody can use owner commands (fails closed, not open).
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;


const NEW_PATTERN = /^\/new(?:@\S+)?\s+(\d{2,3})\s+([\s\S]+)$/i;
const REVISE_PATTERN = /^\/revise(?:@\S+)?\s+(AC-\d{4}-\d{2,}|AC-CLICK-\d{4})\s+([\s\S]+)$/i;
const FILES_PATTERN = /^\/files(?:@\S+)?\s+(AC-\d{4}-\d{2,}|AC-CLICK-\d{4})\b/i;
const DELIVER_PATTERN = /^\/deliver(?:@\S+)?\s+(AC-\d{4}-\d{2,}|AC-CLICK-\d{4})\s+(\S+)$/i;
const QUEUE_PATTERN = /^\/queue(?:@\S+)?$/i;
const HELP_PATTERN = /^\/(start|help)(?:@\S+)?$/i;
const AVATARS_PATTERN = /^\/avatars(?:@\S+)?((?:\s+\S+)*)\s*$/i;
const VOICES_PATTERN = /^\/voices(?:@\S+)?((?:\s+\S+)*)\s*$/i;
const ADDAVATAR_PATTERN = /^\/addavatar(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i;
const ADDVOICE_PATTERN = /^\/addvoice(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/i;
const REPORT_PATTERN = /^\/report(?:@\S+)?\s+(\S+)$/i;
const SETAVATAR_PATTERN = /^\/setavatar(?:@\S+)?\s+(\S+)(?:\s+(photo))?\s*$/i;
const SETVOICE_PATTERN = /^\/setvoice(?:@\S+)?\s+(\S+)\s*$/i;
const CASTING_PATTERN = /^\/casting(?:@\S+)?$/i;


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

function helpText(): string {
  return [
    'Commands:',
    '/queue — list queued/in-progress tasks',
    '/stats — accounts, balances and volume, today and all-time',
    '/status <task id> — how a task is doing, and why it is stuck if it is',
    '/products — list every product and its number',
    '/new <product number> <brief> — create an owner task (e.g. /new 72 letterhead for agenticcore.agency)',
    '/revise <task id> <note> — re-queue a delivered task for revision',
    "/files <task id> — list a task's deliverable files",
    '/deliver <task id> <url> — manually attach a file and mark delivered',
    "/report <url> — owner-only business report (flaws, improvements, marketing plan)",
    "/avatars [gender|name] [page] — browse avatars as previews",
    "/voices [language|gender|name] [page] — browse voices, playable",
    '/addavatar <id> <name> — add an avatar to the client-facing picker',
    '/addvoice <id> <name> — add a voice to the client-facing picker',
    '/casting — who appears in a video that names nobody',
    '/setavatar <id> [photo] — set the default avatar',
    '/setvoice <id> — set the default voice',
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

  const line = (t: any) => `${t.public_id} — ${t.type}${t.subtype ? `/${t.subtype}` : ''} [${t.status}]`;
  const clients = data.filter((t: any) => t.source === 'website');
  const mine = data.filter((t: any) => t.source !== 'website');

  const sections: string[] = [];
  if (clients.length > 0) sections.push(`CLIENTS (${clients.length}) — always built first:`, ...clients.map(line));
  if (mine.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push(
      `YOURS (${mine.length})${clients.length > 0 ? ` — start as the client queue clears` : ''}:`,
      ...mine.map(line)
    );
  }
  return sections.join('\n');
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

  const publicId = await allocateOwnerTask();
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
  const result = await applyRevision(publicId, note, 'owner');
  if (result.ok) triggerDispatch();
  return result.message;
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

// Browsing a catalog you cannot see is not browsing.
//
// This used to print fifteen lines of text with a preview URL on each, out
// of 1266 avatars -- so choosing one meant opening links one at a time and
// remembering which id belonged to which face. Nobody picks an avatar that
// way, and picking the avatar is the whole decision.
//
// Now each option arrives as the actual preview, and the caption under it is
// the exact command that selects it: one tap to copy, one send to add. The
// id never has to be typed or matched up by hand.

async function handleAvatarsCommand(chatId: number, raw?: string): Promise<string> {
  const { filter, page } = parseBrowseArgs(raw);
  try {
    let avatars = await listAvatars();
    if (filter) {
      // Gender OR name, because "female" and "abigail" are both things a
      // person actually types, and neither should return nothing.
      const needle = filter.toLowerCase();
      avatars = avatars.filter(
        (a) => a.gender?.toLowerCase() === needle || a.name.toLowerCase().includes(needle)
      );
    }
    if (avatars.length === 0) return `No avatars found${filter ? ` matching "${filter}"` : ''}.`;

    const p = paginate(avatars.length, page);
    for (const avatar of avatars.slice(p.from, p.to)) {
      // The caption IS the command. Copy one line, send it, done.
      const caption = `${avatar.name} (${avatar.gender ?? '?'})\n\n/addavatar ${avatar.providerId} ${avatar.name}`;
      const preview = avatar.previewImageUrl ?? avatar.previewVideoUrl;
      // A preview that fails to send must still leave something choosable in
      // the chat -- a silent gap is worse than a plain link, because the
      // option simply disappears from the page you are picking from.
      if (preview) {
        await sendTelegramPhoto(chatId, preview, caption).catch(async (err) => {
          console.error('telegram-webhook: avatar preview failed', err);
          await sendTelegramText(chatId, `${caption}\n\nPreview: ${preview}`).catch(() => {});
        });
      } else {
        await sendTelegramText(chatId, `${caption}\n\n(no preview image)`).catch(() => {});
      }
    }

    return browseFooter('avatars', filter, p, avatars.length);
  } catch (err) {
    console.error('telegram-webhook: /avatars failed', err);
    return 'Could not load HeyGen avatars right now.';
  }
}

async function handleVoicesCommand(chatId: number, raw?: string): Promise<string> {
  const { filter, page } = parseBrowseArgs(raw);
  try {
    let voices = await listVoices();
    if (filter) {
      const needle = filter.toLowerCase();
      voices = voices.filter(
        (v) =>
          v.language?.toLowerCase().includes(needle) ||
          v.gender?.toLowerCase() === needle ||
          v.name.toLowerCase().includes(needle)
      );
    }
    if (voices.length === 0) return `No voices found${filter ? ` matching "${filter}"` : ''}.`;

    const p = paginate(voices.length, page);
    for (const voice of voices.slice(p.from, p.to)) {
      // Choosing a voice means hearing it. A link to an mp3 is not hearing it.
      const caption = `${voice.name} (${voice.language ?? '?'}, ${voice.gender ?? '?'})\n\n/addvoice ${voice.providerId} ${voice.name}`;
      const sample = voice.previewAudioUrl;
      if (sample) {
        await sendTelegramAudio(chatId, sample, caption, voice.name).catch(async (err) => {
          console.error('telegram-webhook: voice preview failed', err);
          await sendTelegramText(chatId, `${caption}\n\nSample: ${sample}`).catch(() => {});
        });
      } else {
        // The name is not nothing -- "Bright & Energetic" is still a choice --
        // so say the sample is missing rather than dropping the option.
        await sendTelegramText(chatId, `${caption}\n\n(no sample available for this voice)`).catch(() => {});
      }
    }

    return browseFooter('voices', filter, p, voices.length);
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

  // The first one added becomes the house default too. Adding an avatar to
  // an empty picker and then finding your test video rendered somebody
  // else's face is a surprise nobody should have to debug; adopting the
  // first choice is what a person means by it, and the reply says so rather
  // than doing it silently. Later ones only join the picker -- changing the
  // default after that is an explicit /setavatar.
  const alreadySet = kind === 'avatar' ? await hasDefaultAvatar() : await hasDefaultVoice();
  if (!alreadySet) {
    if (kind === 'avatar') await setDefaultAvatar(providerId);
    else await setDefaultVoice(providerId);
  }
  const adopted = !alreadySet;

  const note = adopted
    ? `\n\nThis is now the default ${kind} for videos that don't name one. Change it any time with /set${kind} <id>.`
    : '';
  return `Added "${name}" (${providerId}) to the ${kind} picker.${note}`;
}

// Setting the house presenter from where the previews are. It used to be a
// Supabase environment variable, which the person choosing it cannot reach
// from a phone at the moment they are actually looking at the faces.
async function handleSetAvatarCommand(providerId: string, asPhoto?: string): Promise<string> {
  try {
    await setDefaultAvatar(providerId, asPhoto ? 'talking_photo' : 'avatar');
    return `Videos will now use ${providerId} unless an order names a different avatar.`;
  } catch (err) {
    console.error('telegram-webhook: /setavatar failed', err);
    return 'Could not save that avatar.';
  }
}

async function handleSetVoiceCommand(providerId: string): Promise<string> {
  try {
    await setDefaultVoice(providerId);
    return `Videos will now use voice ${providerId} unless an order names a different one.`;
  } catch (err) {
    console.error('telegram-webhook: /setvoice failed', err);
    return 'Could not save that voice.';
  }
}

// Answering "who is actually going to be in the video?" without reading logs
// or guessing which of three fallbacks won.
async function handleCastingCommand(): Promise<string> {
  const defaults = await getVideoDefaults();
  const source = (chosen: boolean) => (chosen ? 'chosen here' : 'deployment fallback');
  return [
    'Videos with no avatar or voice named on the order will use:',
    '',
    `Avatar: ${defaults.character.providerId} (${defaults.character.type}, ${source(defaults.avatarChosen)})`,
    `Voice:  ${defaults.voiceId} (${source(defaults.voiceChosen)})`,
    '',
    'Change with /setavatar <id> or /setvoice <id>.'
  ].join('\n');
}

async function handleReportCommand(chatId: number, url: string): Promise<string> {
  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

  const publicId = await allocateOwnerTask();
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


// The conversational path hands back whatever task id the model produced, and
// a model asked for a task id when none was stated will produce a plausible
// one -- "AC-CLICK-0007" is a very guessable string. Acting on that revises
// somebody else's task and reports success, so the id is checked against real
// rows before any handler runs.
//
// When it doesn't exist, the original message is re-read against the owner's
// actual task list (the same recogniser Forge uses on the client side), so
// "revise that letterhead" still works -- and when the list genuinely doesn't
// decide, the answer is a question rather than a guess.
interface ResolvedTaskId {
  publicId?: string;
  reply?: string;
}

async function resolveTaskId(proposed: string, originalText: string): Promise<ResolvedTaskId> {
  const candidate = proposed?.toUpperCase?.() ?? '';
  if (candidate) {
    const { data } = await supabaseAdmin.from('tasks').select('public_id').eq('public_id', candidate).maybeSingle();
    if (data) return { publicId: data.public_id };
  }

  const match = await resolveOwnerTaskReference(originalText);
  if (match.order) return { publicId: match.order.publicId };

  if (match.candidates.length > 0) {
    return {
      reply: `Which one do you mean?\n${describeCandidates(match.candidates)}`
    };
  }

  return {
    reply: candidate
      ? `No task found with id ${candidate}, and I couldn't work out which one you meant. Send /queue to see what's open.`
      : "I couldn't work out which task you meant. Send /queue to see what's open."
  };
}


// The account desk's owner-facing view. Asked often enough in plain words
// ("how many clients do we have with money in?") that it gets a command too.
async function handleStatsCommand(): Promise<string> {
  const stats = await getPlatformSnapshot();

  const products = stats.topProducts.length
    ? stats.topProducts.map((p) => `  ${p.sku} ${p.name} — ${p.count}`).join('\n')
    : '  (nothing ordered yet)';

  return [
    `TODAY: ${stats.today.ordered} ordered, ${stats.today.delivered} delivered, ${stats.today.failed} failed, ${stats.today.accounts} account(s) active`,
    `LAST 7 DAYS: ${stats.last7Days.ordered} ordered, ${stats.last7Days.delivered} delivered, ${stats.last7Days.failed} failed, ${stats.last7Days.accounts} account(s) active`,
    '',
    `ALL TIME`,
    `Signed up: ${stats.registeredUsers} — of those, ${stats.accountsWithBalance} have money in the wallet and ${stats.accountsActive30d} ordered in the last 30 days`,
    `Account numbers issued: ${stats.accountsWithOrderNumber} (issued on an account's first order)`,
    `Balance held: $${stats.balanceHeldUsd.toFixed(2)}`,
    `Tasks: ${stats.tasksTotal} total — ${stats.tasksDelivered} delivered, ${stats.tasksInFlight} in flight, ${stats.tasksNeedingInfo} need info, ${stats.tasksFailed} failed`,
    'Most ordered:',
    products
  ].join('\n');
}

// Answers "what is happening with this one?" from the task's own record. The
// reason a task stopped is written by the worker into task_events; before this
// the bot had no way to read it, so asked why a video was waiting it described
// a letterhead instead -- confidently, and entirely from the conversation.
async function handleStatusCommand(publicId: string): Promise<string> {
  const report = await getTaskStatus(publicId);
  if (!report) return `No task found with id ${publicId}.`;

  const lines = [`${report.publicId} — ${report.product} — ${report.status}`];

  if (report.reason) {
    lines.push(
      report.status === 'needs_info'
        ? `Waiting on: ${report.reason}`
        : `Reason: ${report.reason}`
    );
  } else if (report.status === 'needs_info') {
    // Never invent one. A missing reason is itself worth reporting.
    lines.push('Waiting on: no reason was recorded against this task.');
  }

  if (report.revisionsAllowed > 0) {
    lines.push(`Revisions: ${report.revisionsUsed} of ${report.revisionsAllowed} used`);
  }
  if (report.fileUrls.length > 0) {
    lines.push(`Files (${report.fileUrls.length}):`, ...report.fileUrls.slice(0, 5));
  }

  return lines.join('\n');
}

async function routeMessage(chatId: number, text: string, attachmentUrls: string[] = []): Promise<string> {
  if (HELP_PATTERN.test(text)) return helpText();
  if (QUEUE_PATTERN.test(text)) return handleQueueCommand();
  if (/^\/products(?:@\S+)?$/i.test(text)) return handleProductsCommand();
  if (/^\/stats(?:@\S+)?$/i.test(text)) return handleStatsCommand();

  const statusMatch = text.match(/^\/status(?:@\S+)?\s+(AC-\d{4}-\d{2,}|AC-CLICK-\d{4})\s*$/i);
  if (statusMatch) return handleStatusCommand(statusMatch[1].toUpperCase());

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
  if (avatarsMatch) return handleAvatarsCommand(chatId, avatarsMatch[1]);

  const voicesMatch = text.match(VOICES_PATTERN);
  if (voicesMatch) return handleVoicesCommand(chatId, voicesMatch[1]);

  const setAvatarMatch = text.match(SETAVATAR_PATTERN);
  if (setAvatarMatch) return handleSetAvatarCommand(setAvatarMatch[1], setAvatarMatch[2]);

  const setVoiceMatch = text.match(SETVOICE_PATTERN);
  if (setVoiceMatch) return handleSetVoiceCommand(setVoiceMatch[1]);

  if (CASTING_PATTERN.test(text)) return handleCastingCommand();

  const reportMatch = text.match(REPORT_PATTERN);
  if (reportMatch) return handleReportCommand(chatId, reportMatch[1].trim());

  const mentionedTask = findTaskReference(text);
  if (mentionedTask && /^\//.test(text)) {
    return `Unrecognized command. Try /files ${mentionedTask} or /revise ${mentionedTask} <note>.`;
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
    case 'stats':
      return handleStatsCommand();
    case 'status': {
      const resolved = await resolveTaskId(parsed.taskId, text);
      return resolved.publicId ? handleStatusCommand(resolved.publicId) : resolved.reply!;
    }
    case 'new':
      return handleNewCommand(chatId, parsed.sku, parsed.brief, parsed.referenceFiles, parsed.details);
    case 'revise': {
      const resolved = await resolveTaskId(parsed.taskId, text);
      return resolved.publicId ? handleReviseCommand(resolved.publicId, parsed.note) : resolved.reply!;
    }
    case 'files': {
      const resolved = await resolveTaskId(parsed.taskId, text);
      return resolved.publicId ? handleFilesCommand(resolved.publicId) : resolved.reply!;
    }
    case 'deliver': {
      const resolved = await resolveTaskId(parsed.taskId, text);
      return resolved.publicId ? handleDeliverCommand(resolved.publicId, parsed.url) : resolved.reply!;
    }
    case 'avatars':
      return handleAvatarsCommand(chatId, parsed.gender);
    case 'voices':
      return handleVoicesCommand(chatId, parsed.filter);
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
