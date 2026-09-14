// Grok's real STT/TTS APIs (api.x.ai/v1/stt, /v1/tts) -- confirmed via
// xAI's own docs, not guessed. STT's `language` field only documents 24
// explicit codes (no 'ur'), but omitting it just disables number/currency
// formatting -- it still transcribes whatever is spoken. TTS supports
// `language: 'auto'` for automatic detection from the input text, which is
// the safe default for Urdu since it isn't one of TTS's explicit codes
// either; if Grok's Urdu output proves weak in practice, swap in a
// dedicated provider here without touching any caller.

const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_BASE_URL = 'https://api.x.ai/v1';

export interface Transcription {
  text: string;
  language: string;
}

export async function transcribeAudio(bytes: Uint8Array, filename: string): Promise<Transcription> {
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

// Returns raw audio bytes (mp3) ready to send as a Telegram voice note
// (Telegram accepts mp3 for sendVoice, alongside ogg/opus).
export async function synthesizeSpeech(text: string, language: string): Promise<Uint8Array> {
  const resp = await fetch(`${XAI_BASE_URL}/tts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language,
      voice_id: 'rex',
      output_format: { codec: 'mp3' }
    })
  });
  if (!resp.ok) {
    throw new Error(`Grok TTS failed (${resp.status}): ${await resp.text()}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}
