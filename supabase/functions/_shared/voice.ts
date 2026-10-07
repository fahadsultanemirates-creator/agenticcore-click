import type { Bytes } from './bytes.ts';
// Grok's real STT/TTS APIs (api.x.ai/v1/stt, /v1/tts) -- confirmed via
// xAI's own docs, not guessed. STT only -- there is no TTS here any more.
//
// Voice goes one way across the whole product now: a client may speak to
// the Telegram bot or to Forge, and both answer in text. The synthesis
// half had no callers left once Forge's "Play" button went, and an unused
// speech function is how a bot starts talking again.
//
// STT's `language` field is left unset: that only disables number and
// currency formatting, and it still transcribes whatever is spoken --
// which is what we want, because a caller may speak anything even though
// everything we send back is English.

const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_BASE_URL = 'https://api.x.ai/v1';

export interface Transcription {
  text: string;
  language: string;
}

export async function transcribeAudio(bytes: Bytes, filename: string): Promise<Transcription> {
  const form = new FormData();
  form.set('file', new Blob([bytes]), filename);

  const resp = await fetch(`${XAI_BASE_URL}/stt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${XAI_API_KEY}` },
    body: form
  });
  if (!resp.ok) {
    throw new Error(`Grok STT failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  if (typeof data?.text !== 'string') {
    throw new Error('Grok STT returned no text');
  }
  return { text: data.text, language: data.language ?? 'auto' };
}

