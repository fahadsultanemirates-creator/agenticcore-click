import type { Bytes } from './bytes.ts';
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

export async function sendTelegramText(chatId: number, text: string): Promise<void> {
  const truncated = text.length > MAX_TELEGRAM_MESSAGE_LENGTH ? text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH) + '…' : text;
  const resp = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: truncated })
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
