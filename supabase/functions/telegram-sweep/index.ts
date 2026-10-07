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
import { getWebhookInfo, setMyCommands, setWebhook } from '../_shared/telegramApi.ts';
import { CLIENT_COMMANDS } from '../_shared/tgMenu.ts';
import { checkWebhook, REQUIRED_UPDATES } from '../_shared/tgWebhook.ts';

async function ensureWebhook(): Promise<string> {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  const base = Deno.env.get('SUPABASE_URL');
  if (!secret || !base) return 'skipped: TELEGRAM_WEBHOOK_SECRET or SUPABASE_URL unset';

  const url = `${base}/functions/v1/telegram-webhook`;
  const info = await getWebhookInfo().catch(() => null);
  const verdict = checkWebhook(info, url);

  // Telegram reports a webhook it has given up on here and nowhere else.
  if (info?.last_error_message) {
    console.error(`telegram-sweep: Telegram last failed to deliver: ${info.last_error_message}`);
  }

  if (!verdict.repair) return verdict.reason;

  console.log(`telegram-sweep: re-registering webhook -- ${verdict.reason}`);
  const ok = await setWebhook(url, secret, REQUIRED_UPDATES).catch(() => false);
  return ok ? `repaired: ${verdict.reason}` : `repair FAILED: ${verdict.reason}`;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  // Re-register the command menu on every sweep.
  //
  // Telegram stores this on its side, not ours, so it survives a deploy
  // and would survive a change to the list -- which is the problem. Once
  // an hour is free, idempotent, and means the menu a client sees always
  // matches the commands this build answers, with no step anybody has to
  // remember after editing the list.
  await setMyCommands(CLIENT_COMMANDS).catch(() => {});

  // And re-check the webhook subscription on the same schedule, for the
  // same reason: Telegram holds it, not us. A webhook registered without
  // callback_query drops every button tap before it reaches this project
  // -- no request, no log line, nothing to find -- so the only way to
  // notice is to ask Telegram what it thinks it is sending.
  const webhook = await ensureWebhook();

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

  return jsonResponse({ ok: true, reminded, paused: rows.length, webhook });
}

Deno.serve(handleRequest);
