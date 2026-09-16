// Every reply from the owner's bot goes out as both a short plain-language
// text message and a short spoken voice note, in whichever of
// English/Urdu the owner last used. This is the one chokepoint all of
// telegram-webhook, daily-summary, and worker notifyOwner calls go
// through, so that rule holds everywhere without each caller re-doing it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claudeChat } from './claude.ts';
import { synthesizeSpeech } from './voice.ts';
import { sendTelegramText, sendTelegramVoice } from './telegramApi.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export type BotLanguage = 'en' | 'ur';

// Urdu is written in Arabic script (U+0600-U+06FF etc.) -- since the bot
// only ever needs to distinguish English vs Urdu, script presence is a
// reliable, zero-cost signal without a model round-trip.
export function detectLanguage(text: string): BotLanguage {
  return /[؀-ۿݐ-ݿ]/.test(text) ? 'ur' : 'en';
}

export async function getOwnerLanguage(): Promise<BotLanguage> {
  const { data } = await supabaseAdmin.from('bot_settings').select('value').eq('key', 'owner_language').maybeSingle();
  return data?.value === 'ur' ? 'ur' : 'en';
}

export async function setOwnerLanguage(language: BotLanguage): Promise<void> {
  await supabaseAdmin
    .from('bot_settings')
    .upsert({ key: 'owner_language', value: language, updated_at: new Date().toISOString() });
}

interface ComposedReply {
  text: string;
  spoken: string;
}

async function composeReply(rawMessage: string, language: BotLanguage): Promise<ComposedReply> {
  const languageName = language === 'ur' ? 'Urdu' : 'English';
  try {
    // Claude, like every other place in this system where words are written
    // or reasoned about. Grok stays for image generation and speech, which
    // are the things Claude's API doesn't do.
    const raw = await claudeChat(
      [
        {
          role: 'system',
          content:
            `Localize this message from a business-automation bot for its owner into natural ${languageName}. ` +
            'Keep any task IDs, URLs, and numbers exactly as given in the text version. Then write a very short ' +
            '(one sentence) spoken-friendly paraphrase in the same language -- no URLs, no IDs, no symbols, no code, ' +
            'just plain words describing what happened. Respond with ONLY JSON: {"text": "...", "spoken": "..."}'
        },
        { role: 'user', content: rawMessage }
      ],
      { maxTokens: 600, effort: 'low' }
    );
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.text === 'string' && typeof parsed?.spoken === 'string') {
      return parsed;
    }
  } catch (err) {
    console.error('composeReply failed, falling back to raw message', err);
  }
  // Fallback: send the raw (English) message verbatim rather than fail silently.
  return { text: rawMessage, spoken: rawMessage };
}

export async function sendBotMessage(chatId: number, rawMessage: string, language?: BotLanguage): Promise<void> {
  const lang = language ?? (await getOwnerLanguage());
  const { text, spoken } = await composeReply(rawMessage, lang);

  await sendTelegramText(chatId, text);

  try {
    const audio = await synthesizeSpeech(spoken, lang === 'ur' ? 'auto' : 'en');
    await sendTelegramVoice(chatId, audio);
  } catch (err) {
    // Voice is a nice-to-have on top of the text reply, never a reason to
    // fail the whole notification.
    console.error('sendBotMessage: voice synthesis/send failed', err);
  }
}
