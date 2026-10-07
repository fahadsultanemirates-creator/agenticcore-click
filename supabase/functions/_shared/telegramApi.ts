import type { Bytes } from './bytes.ts';
import type { WebhookInfo } from './tgWebhook.ts';
// Low-level Telegram Bot API calls.
//
// Voice goes one way only: in. Telegram stores an incoming voice note as
// .oga (ogg/opus), downloadable via getFile, and the bot transcribes it.
// There is deliberately no sendVoice wrapper here -- the bot replies in
// text, always. The wrapper existed, had no callers left once spoken
// replies were dropped, and an unused send function is how the rule gets
// broken again by someone who finds it and assumes it is there to be used.

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}`;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4000;

/**
 * Telegram renders a link preview card for the first URL in a message,
 * and caches that card per URL for a long time -- long enough that the
 * site's open-graph image can be replaced and the chat keeps showing the
 * old one. It did: a delivered logo arrived under a stale marketing card
 * for the previous brand, between the client and the files they ordered.
 *
 * The bot's links are destinations (the dashboard, /claim, an invoice),
 * never things to preview, so none of them is worth a card.
 */
const NO_LINK_PREVIEW = { link_preview_options: { is_disabled: true } } as const;

/**
 * A message with buttons under it.
 *
 * Telegram calls these an inline keyboard: the buttons live on the
 * message, not on the chat, so an old message's buttons stay tappable
 * forever. That is why _shared/tgMenu.ts decodes an unrecognised code as
 * "unknown" rather than throwing -- somebody will tap a button from
 * before a deploy.
 */
export async function sendTelegramKeyboard(
  chatId: number,
  text: string,
  keyboard: { text: string; data?: string; url?: string }[][]
): Promise<void> {
  const truncated = text.length > MAX_TELEGRAM_MESSAGE_LENGTH ? text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '…' : text;
  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: truncated,
      ...NO_LINK_PREVIEW,
      reply_markup: {
        inline_keyboard: keyboard.map((row) =>
          row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))
        )
      }
    })
  });
  if (!resp.ok) {
    console.error(`Telegram sendMessage (keyboard) failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

/**
 * Stops the spinner on a tapped button.
 *
 * Telegram shows a loading state on a button until this is called, and
 * gives roughly ten seconds before it decides the bot is broken. So it is
 * called first, before any work -- not after, when a model call or a
 * chain read has already spent the budget.
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  const resp = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
  });
  if (!resp.ok) {
    console.error(`Telegram answerCallbackQuery failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

/**
 * Registers the command list behind Telegram's Menu button.
 *
 * Scoped to private chats so the owner's commands and a client's are not
 * both advertised to everybody. Telegram rejects the whole call if any
 * single command is malformed -- one bad entry costs the entire menu, not
 * just its own line -- which is what tgMenu's test checks.
 */
export async function setMyCommands(
  commands: { command: string; description: string }[],
  scope: 'all_private_chats' | 'default' = 'all_private_chats'
): Promise<boolean> {
  const resp = await fetch(`${TELEGRAM_API}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands, scope: { type: scope } })
  });
  if (!resp.ok) {
    console.error(`Telegram setMyCommands failed (${resp.status}):`, await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

/**
 * What Telegram currently believes about our webhook.
 *
 * Worth reading even when nothing looks wrong: `last_error_message` and
 * `pending_update_count` are the only place a webhook that Telegram has
 * given up on says so.
 */
export async function getWebhookInfo(): Promise<WebhookInfo | null> {
  const resp = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
  if (!resp.ok) {
    console.error(`Telegram getWebhookInfo failed (${resp.status}):`, await resp.text().catch(() => ''));
    return null;
  }
  const body = await resp.json().catch(() => null);
  return (body?.result ?? null) as WebhookInfo | null;
}

/**
 * Re-registers the webhook, URL, secret and update subscription together.
 *
 * Telegram has no way to change `allowed_updates` on its own -- setWebhook
 * is the whole registration or nothing -- so the secret has to be passed
 * again here or the next update arrives without the header the webhook
 * checks, and every message is rejected. drop_pending_updates is left at
 * its default of false: a client's tap queued a moment ago should still
 * be delivered.
 */
export async function setWebhook(url: string, secretToken: string, allowedUpdates: readonly string[]): Promise<boolean> {
  const resp = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: allowedUpdates })
  });
  if (!resp.ok) {
    console.error(`Telegram setWebhook failed (${resp.status}):`, await resp.text().catch(() => ''));
    return false;
  }
  return true;
}

export async function sendTelegramText(chatId: number, text: string): Promise<void> {
  const truncated = text.length > MAX_TELEGRAM_MESSAGE_LENGTH ? text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '…' : text;
  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncated, ...NO_LINK_PREVIEW })
  });
  if (!resp.ok) {
    console.error(`Telegram sendMessage failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

// Sends the actual file into the chat (not just a link) -- Telegram
// fetches the URL itself server-side, so no download/re-upload needed
// here as long as the URL is publicly reachable (our deliverables bucket
// is public-read).
export async function sendTelegramDocument(chatId: number, url: string, caption?: string): Promise<void> {
  const resp = await fetch(`${TELEGRAM_API}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: url,
      ...(caption ? { caption: caption.slice(0, 1024) } : {})
    })
  });
  if (!resp.ok) {
    console.error(`Telegram sendDocument failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

// Same URL-mode approach as sendTelegramDocument, but renders inline as a
// photo in the chat instead of a downloadable file attachment -- the right
// choice for image-option deliverables (logos, social posts, etc).
export async function sendTelegramPhoto(chatId: number, url: string, caption?: string): Promise<void> {
  const resp = await fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: url,
      ...(caption ? { caption: caption.slice(0, 1024) } : {})
    })
  });
  if (!resp.ok) {
    console.error(`Telegram sendPhoto failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

export async function downloadTelegramFile(fileId: string): Promise<Bytes> {
  const metaResp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  if (!metaResp.ok) {
    throw new Error(`Telegram getFile failed (${metaResp.status}): ${await metaResp.text()}`);
  }
  const meta = await metaResp.json();
  const filePath = meta?.result?.file_path;
  if (typeof filePath !== 'string') {
    throw new Error('Telegram getFile returned no file_path');
  }

  const fileResp = await fetch(`${TELEGRAM_FILE_API}/${filePath}`);
  if (!fileResp.ok) {
    throw new Error(`Telegram file download failed (${fileResp.status})`);
  }
  return new Uint8Array(await fileResp.arrayBuffer());
}

// Audio by URL, so a HeyGen voice preview plays inline in the chat with a
// title rather than arriving as a file to download. Choosing a voice means
// hearing it; a link to an mp3 is not hearing it.
export async function sendTelegramAudio(chatId: number, url: string, caption?: string, title?: string): Promise<void> {
  const resp = await fetch(`${TELEGRAM_API}/sendAudio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, audio: url, caption, title })
  });
  if (!resp.ok) {
    throw new Error(`Telegram sendAudio failed (${resp.status}): ${await resp.text()}`);
  }
}

// Video by URL, so a delivered render plays inline in the chat instead of
// arriving as a file to download. Telegram fetches the URL itself.
export async function sendTelegramVideo(chatId: number, url: string, caption?: string): Promise<void> {
  const resp = await fetch(`${TELEGRAM_API}/sendVideo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, video: url, caption })
  });
  if (!resp.ok) {
    throw new Error(`Telegram sendVideo failed (${resp.status}): ${await resp.text()}`);
  }
}
