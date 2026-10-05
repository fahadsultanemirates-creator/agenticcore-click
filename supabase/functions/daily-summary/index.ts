// Cron-invoked at 19:00 UTC (11pm Asia/Dubai, UTC+4, no DST) -- a daily
// wrap-up of what happened in the last 24h: tasks delivered/failed and
// wallet top-ups. Sent to the owner's own chat (in a private Telegram
// chat, chat_id equals the user's numeric id, i.e. OWNER_TELEGRAM_ID) via
// the same text+voice pipeline every other reply uses.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendBotMessage } from '../_shared/botMessage.ts';
import { jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OWNER_TELEGRAM_ID = Deno.env.get('OWNER_TELEGRAM_ID') || undefined;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });
  if (!OWNER_TELEGRAM_ID) return jsonResponse({ ok: false, error: 'OWNER_TELEGRAM_ID not set' }, 500);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: delivered }, { data: failed }, { data: topups }] = await Promise.all([
    supabaseAdmin.from('tasks').select('public_id, type, source').eq('status', 'delivered').gte('updated_at', since),
    supabaseAdmin.from('tasks').select('public_id, type, source').eq('status', 'failed').gte('updated_at', since),
    // usdt_invoices, not wallet_topups. wallet_topups was PayRam's table and
    // nothing writes to it any more, so this figure had been a guaranteed
    // zero since the switch to USDT -- a summary line that cannot report a
    // real number is worse than no line, because it reads as "no sales
    // today" rather than "not measured".
    //
    // base_usd is the amount credited to the wallet. `amount` is the
    // on-chain figure, which carries the per-invoice nonce (20.000007) and
    // would quietly inflate the total.
    supabaseAdmin.from('usdt_invoices').select('base_usd, tier').eq('status', 'paid').gte('paid_at', since)
  ]);

  const deliveredCount = delivered?.length ?? 0;
  const failedCount = failed?.length ?? 0;
  const topupCount = topups?.length ?? 0;
  const topupTotal = (topups ?? []).reduce((sum, t: any) => sum + Number(t.base_usd ?? 0), 0);

  if (deliveredCount === 0 && failedCount === 0 && topupCount === 0) {
    return jsonResponse({ ok: true, skipped: true });
  }

  const lines = [
    "Here's today's summary:",
    `- Tasks delivered: ${deliveredCount}${deliveredCount ? ` (${(delivered ?? []).map((t: any) => t.public_id).join(', ')})` : ''}`,
    failedCount ? `- Tasks failed: ${failedCount} (${(failed ?? []).map((t: any) => t.public_id).join(', ')})` : '- Tasks failed: 0',
    `- Wallet top-ups: ${topupCount}${topupCount ? ` totaling $${topupTotal.toFixed(2)}` : ''}`
  ];
  await sendBotMessage(Number(OWNER_TELEGRAM_ID), lines.join('\n'));

  return jsonResponse({ ok: true, deliveredCount, failedCount, topupCount });
}

Deno.serve(handleRequest);
