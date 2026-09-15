// Thin wrapper around Anthropic's Claude API -- mirrors grok.ts's shape
// (claudeChat/claudeVisionChat with the same messages-array calling
// convention) so callers can swap providers with an import change. Claude
// does the "reasoning and writing" work across the platform (website code,
// PDF/document content, business report analysis, social copy, Forge and
// the Telegram bot's conversation) -- Grok stays for image generation,
// HeyGen for avatar video, and Grok STT/TTS for voice, since none of those
// are things Claude's API does.
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.125.0';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

function extractText(content: { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('');
}

function checkRefusal(response: { stop_reason?: string | null; stop_details?: { category?: string | null } | null }): void {
  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude refused the request (${response.stop_details?.category ?? 'unspecified'})`);
  }
}

// messages may include a 'system' entry (first one found, matching grokChat's
// calling convention) -- pulled out into Claude's top-level `system` field
// since Claude doesn't accept a 'system' role inside the messages array.
export async function claudeChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { maxTokens?: number; effort?: Effort } = {}
): Promise<string> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const conversation = messages.filter((m) => m.role !== 'system') as { role: 'user' | 'assistant'; content: string }[];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system,
    messages: conversation,
    output_config: { effort: opts.effort ?? 'high' }
  });

  checkRefusal(response);
  const text = extractText(response.content);
  if (!text.trim()) {
    throw new Error('Claude returned no text content');
  }
  return text;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function claudeVisionChat(
  systemPrompt: string,
  userText: string,
  images: { bytes: Uint8Array; mimeType: string }[],
  opts: { maxTokens?: number; effort?: Effort } = {}
): Promise<string> {
  const content = [
    ...images.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: bytesToBase64(image.bytes) }
    })),
    { type: 'text' as const, text: userText }
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
    output_config: { effort: opts.effort ?? 'high' }
  });

  checkRefusal(response);
  const text = extractText(response.content);
  if (!text.trim()) {
    throw new Error('Claude returned no text content');
  }
  return text;
}
