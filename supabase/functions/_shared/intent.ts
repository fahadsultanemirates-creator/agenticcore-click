// Fallback command router for anything that isn't a literal slash command
// -- always used for voice transcripts (they never contain a literal "/"),
// and for typed free-form text that didn't match a regex. Lets the owner
// just say/type what they want in plain English or Urdu.

import { grokChat } from './grok.ts';

export type BotIntent =
  | { intent: 'queue' }
  | { intent: 'help' }
  | { intent: 'new'; type: string; brief: string }
  | { intent: 'revise'; taskId: string; note: string }
  | { intent: 'files'; taskId: string }
  | { intent: 'deliver'; taskId: string; url: string }
  | { intent: 'avatars'; gender?: string }
  | { intent: 'voices'; filter?: string }
  | { intent: 'addavatar'; id: string; name: string }
  | { intent: 'addvoice'; id: string; name: string }
  | { intent: 'report'; url: string }
  | { intent: 'unknown' };

const TASK_TYPES = ['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit'];

export async function classifyIntent(text: string): Promise<BotIntent> {
  try {
    const raw = await grokChat(
      [
        {
          role: 'system',
          content:
            'You route messages (typed or voice-transcribed, in English or Urdu) to an internal owner bot. ' +
            'Determine the intent and extract its arguments. Valid intents and their exact argument shapes:\n' +
            '{"intent":"queue"}\n' +
            '{"intent":"help"}\n' +
            `{"intent":"new","type":one of [${TASK_TYPES.join(', ')}],"brief":string}\n` +
            '{"intent":"revise","taskId":"AC-CLICK-####","note":string}\n' +
            '{"intent":"files","taskId":"AC-CLICK-####"}\n' +
            '{"intent":"deliver","taskId":"AC-CLICK-####","url":string}\n' +
            '{"intent":"avatars","gender":"male"|"female"|omit}\n' +
            '{"intent":"voices","filter":string|omit}\n' +
            '{"intent":"addavatar","id":string,"name":string}\n' +
            '{"intent":"addvoice","id":string,"name":string}\n' +
            '{"intent":"report","url":string}\n' +
            '{"intent":"unknown"}\n' +
            'Respond with ONLY the matching JSON object, nothing else. If nothing fits, use unknown.'
        },
        { role: 'user', content: text }
      ],
      { maxTokens: 300, temperature: 0.1 }
    );
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.intent === 'string') return parsed as BotIntent;
  } catch (err) {
    console.error('classifyIntent failed', err);
  }
  return { intent: 'unknown' };
}
