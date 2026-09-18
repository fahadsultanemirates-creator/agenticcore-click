// Which avatar and voice a video uses when the order did not name one.
//
// This used to be two Supabase secrets, HEYGEN_AVATAR_ID and
// HEYGEN_VOICE_ID, which meant changing the house presenter required opening
// the dashboard, editing an environment variable and waiting for the next
// cold start. The person who actually chooses the presenter does it from
// Telegram, on a phone, while looking at the previews -- so the choice now
// lives where the choosing happens.
//
// The secrets remain as the fallback, so nothing breaks if no default has
// ever been set, and so a fresh deployment still renders.

import { supabaseAdmin } from './storage.ts';
import { DEFAULT_AVATAR, DEFAULT_VOICE_ID, type CharacterChoice } from './heygen.ts';

const AVATAR_KEY = 'default_avatar_id';
const AVATAR_TYPE_KEY = 'default_avatar_type';
const VOICE_KEY = 'default_voice_id';

async function readSetting(key: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('bot_settings').select('value').eq('key', key).maybeSingle();
  const value = data?.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bot_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save ${key}: ${error.message}`);
}

export interface VideoDefaults {
  character: CharacterChoice;
  voiceId: string;
  /** True when the value came from bot_settings rather than the env fallback. */
  avatarChosen: boolean;
  voiceChosen: boolean;
}

export async function getVideoDefaults(): Promise<VideoDefaults> {
  const [avatarId, avatarType, voiceId] = await Promise.all([
    readSetting(AVATAR_KEY),
    readSetting(AVATAR_TYPE_KEY),
    readSetting(VOICE_KEY)
  ]);

  return {
    character: avatarId
      ? { type: avatarType === 'talking_photo' ? 'talking_photo' : 'avatar', providerId: avatarId }
      : DEFAULT_AVATAR,
    voiceId: voiceId ?? DEFAULT_VOICE_ID,
    avatarChosen: avatarId !== null,
    voiceChosen: voiceId !== null
  };
}

export async function setDefaultAvatar(providerId: string, type: 'avatar' | 'talking_photo' = 'avatar'): Promise<void> {
  await writeSetting(AVATAR_KEY, providerId);
  await writeSetting(AVATAR_TYPE_KEY, type);
}

export async function setDefaultVoice(providerId: string): Promise<void> {
  await writeSetting(VOICE_KEY, providerId);
}

/** Whether a default avatar has ever been chosen -- so the first /addavatar can adopt it. */
export async function hasDefaultAvatar(): Promise<boolean> {
  return (await readSetting(AVATAR_KEY)) !== null;
}

export async function hasDefaultVoice(): Promise<boolean> {
  return (await readSetting(VOICE_KEY)) !== null;
}
