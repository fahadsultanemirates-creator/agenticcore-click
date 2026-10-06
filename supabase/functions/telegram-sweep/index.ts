// Hourly: remind the accounts that still have no password, then pause the
// ones whose 30 days are up.
//
// Hourly rather than per-minute because the deadline is in days, and the
// cron only fires this at all when at least one account is still without
// a password -- an idle project makes no requests.
//
// Reminders before pausing, in that order, so an account that crosses
// both lines in the same run is told it has paused rather than told it
// has a day left and then paused silently.
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { sendBotMessage } from '../_shared/botMessage.ts';
import { supabaseAdmin } from '../_shared/storage.ts';
import { accountRemindersDue, PAUSED_NOTICE } from '../_shared/tgClient.ts';

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  let reminded = 0;
  for (const reminder of await accountRemindersDue()) {
    await sendBotMessage(reminder.chatId, reminder.text).catch((err) =>
      console.error('telegram-sweep: reminder failed', err)
    );
    reminded++;
  }

  const { data: paused, error } = await supabaseAdmin.rpc('pause_expired_telegram_accounts');
  if (error) {
    console.error('telegram-sweep: pausing failed', error);
    return jsonResponse({ ok: false, reminded, error: error.message }, 500);
  }

  const rows = (paused ?? []) as { user_id: string; chat_id: number }[];
  for (const row of rows) {
    await sendBotMessage(Number(row.chat_id), PAUSED_NOTICE).catch((err) =>
      console.error('telegram-sweep: pause notice failed', err)
    );
  }

  return jsonResponse({ ok: true, reminded, paused: rows.length });
}

Deno.serve(handleRequest);
