// Is the framework fulfilling orders itself, or is a person?
//
// Manual mode stops the dispatcher handing anything to a worker or to an
// external agent. The task is still claimed, priced, charged and tracked
// exactly as before -- it simply waits for the owner instead of being
// generated.
//
// Read from bot_settings rather than an environment variable so it can be
// changed from the bot, in a second, without a deploy. The day a product
// starts producing something wrong is not the day to be waiting on CI.
import { supabaseAdmin } from './storage.ts';

const SETTING_KEY = 'manual_mode';

/**
 * Default ON.
 *
 * A missing row, an unreadable table, a database hiccup -- all of them
 * mean manual. The failure modes are not symmetric: a task waiting for a
 * person is a delay, a task generated and billed wrongly is a refund, an
 * apology, and a client who does not come back.
 */
export async function manualModeOn(): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('bot_settings')
    .select('value')
    .eq('key', SETTING_KEY)
    .maybeSingle<{ value: string }>();

  if (error) {
    console.error('manualModeOn: could not read the setting, assuming manual', error);
    return true;
  }
  return (data?.value ?? 'on') !== 'off';
}

export async function setManualMode(on: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from('bot_settings')
    .upsert({ key: SETTING_KEY, value: on ? 'on' : 'off', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error('setManualMode failed', error);
}
