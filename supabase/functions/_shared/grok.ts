// Thin wrapper around xAI's OpenAI-compatible API (https://api.x.ai/v1).
// XAI_API_KEY is the only required secret; model names are overridable via
// env vars so a model rename doesn't require a redeploy.

const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_BASE_URL = 'https://api.x.ai/v1';
const CHAT_MODEL = Deno.env.get('XAI_CHAT_MODEL') || 'grok-4';
const IMAGE_MODEL = Deno.env.get('XAI_IMAGE_MODEL') || 'grok-2-image';

export class GrokError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function grokChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const resp = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4000
    })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new GrokError(`xAI chat completion failed (${resp.status}): ${body}`, resp.status);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new GrokError('xAI chat completion returned no content');
  }
  return content;
}

// Extracts the first fenced code block of the given language (or any
// fence if none matches), falling back to the raw text -- Grok reliably
// wraps generated HTML/JSON in ``` fences even when asked not to.
export function extractCodeBlock(text: string, lang?: string): string {
  const patterns = lang ? [new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'i')] : [];
  patterns.push(/```(?:\w+)?\n([\s\S]*?)```/);
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return text.trim();
}

// One image per call (b64) -- more reliable across providers than trusting
// an `n` parameter, since callers that need multiple options (image/social
// workers) just call this in parallel.
export async function grokImage(prompt: string): Promise<Uint8Array> {
  const resp = await fetch(`${XAI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      response_format: 'b64_json'
    })
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new GrokError(`xAI image generation failed (${resp.status}): ${body}`, resp.status);
  }

  const data = await resp.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (typeof b64 !== 'string' || !b64) {
    throw new GrokError('xAI image generation returned no image data');
  }
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
