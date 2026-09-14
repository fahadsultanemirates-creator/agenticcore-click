// Low-level Telegram Bot API calls -- sending/receiving both text and
// voice notes. Voice notes: Telegram accepts mp3/ogg-opus/m4a on the way
// out (sendVoice) and stores incoming ones as .oga (ogg/opus) on the way
// in, downloadable via getFile.

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

export async function sendTelegramVoice(chatId: number, mp3Bytes: Uint8Array): Promise<void> {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('voice', new Blob([mp3Bytes], { type: 'audio/mpeg' }), 'reply.mp3');

  const resp = await fetch(`${TELEGRAM_API}/sendVoice`, { method: 'POST', body: form });
  if (!resp.ok) {
    console.error(`Telegram sendVoice failed (${resp.status}):`, await resp.text().catch(() => ''));
  }
}

export async function downloadTelegramFile(fileId: string): Promise<Uint8Array> {
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
