// Drains the email outbox.
//
// Called every minute by pg_cron through pg_net, and nudged directly by
// the paths that queue mail so a delivery notification does not sit for a
// minute when the sweep could run now. Both are safe: claim_pending_emails
// claims its batch with FOR UPDATE SKIP LOCKED, so overlapping runs take
// different rows rather than sending the same email twice.
//
// Nothing here renders a template. The outbox row holds the facts; the
// wording lives in _shared/emailTemplates.ts and is applied at send time,
// so correcting a sentence also corrects mail that has not left yet.
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { sendEmailDetailed } from '../_shared/email.ts';
import {
  orderDeliveredEmail,
  orderPlacedEmail,
  topUpEmail,
  welcomeEmail,
  type Email
} from '../_shared/emailTemplates.ts';
import { supabaseAdmin } from '../_shared/storage.ts';
import { alertNewAccount } from '../_shared/ownerAlerts.ts';

interface OutboxRow {
  id: string;
  to_email: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

// A payload is whatever the call site wrote into a jsonb column months
// ago. Coercing here rather than trusting it means a row with a missing
// field produces a slightly thin email instead of a 500 that blocks the
// whole batch behind it.
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function render(row: OutboxRow): Email | null {
  const p = row.payload ?? {};
  switch (row.kind) {
    case 'welcome':
      return welcomeEmail();
    case 'order_placed':
      return orderPlacedEmail({
        publicId: str(p.publicId, 'your order'),
        productName: str(p.productName, 'Your order'),
        priceUsd: num(p.priceUsd)
      });
    case 'order_delivered':
      return orderDeliveredEmail({
        publicId: str(p.publicId, 'your order'),
        productName: str(p.productName, 'Your order')
      });
    case 'topup':
      return topUpEmail({ amountUsd: num(p.amountUsd), balanceUsd: num(p.balanceUsd) });
    default:
      return null;
  }
}

/**
 * Where an account came from, inferred from whether it has a linked chat.
 *
 * There is no column that records this, and adding one would mean a
 * second thing to keep true. A Telegram signup writes its link row
 * immediately after creating the user, and this runs at least a cron tick
 * later, so the link is always there by now. Worst case it reads
 * "website" for a Telegram signup, which is a wrong word in a
 * notification and nothing else.
 */
async function signupChannel(email: string): Promise<'website' | 'telegram'> {
  const { data } = await supabaseAdmin.auth.admin.listUsers();
  const user = data?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
  if (!user) return 'website';

  const { data: link } = await supabaseAdmin
    .from('telegram_accounts')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle<{ user_id: string }>();

  return link ? 'telegram' : 'website';
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const { data: claimed, error } = await supabaseAdmin.rpc('claim_pending_emails', { p_limit: 20 });
  if (error) {
    console.error('claim_pending_emails failed:', error);
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const rows = (claimed ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const email = render(row);
    if (!email) {
      // An unknown kind can never succeed, so stop it burning four more
      // attempts and a minute each.
      await supabaseAdmin
        .from('email_outbox')
        .update({ status: 'failed', last_error: `unknown kind "${row.kind}"` })
        .eq('id', row.id);
      failed++;
      continue;
    }

    // Tell the owner about a new account -- here, once, and only here.
    //
    // Every signup passes through this: the welcome row is written by a
    // trigger on auth.users, and a unique index makes it one per address
    // ever. Alerting at each signup path instead would mean two
    // implementations that can disagree about what counts as a signup.
    //
    // `attempts === 1` is the whole guard, and it is not optional. This
    // ran before the send and outside any check, so when Brevo rejected
    // the first welcome email the row stayed pending, the sweep retried
    // it every minute, and the owner got five identical NEW ACCOUNT
    // alerts for one signup. The account is news once; whether its email
    // lands is a separate question with its own retries.
    if (row.kind === 'welcome' && row.attempts === 1) {
      await alertNewAccount({ email: row.to_email, via: await signupChannel(row.to_email) }).catch(() => {});
    }

    const result = await sendEmailDetailed(row.to_email, email);
    if (result.ok) {
      await supabaseAdmin
        .from('email_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id);
      sent++;
    } else if (result.permanent) {
      // Retrying a 401 gets another 401 a minute later, four more times.
      // Retire it now and record what Brevo actually said -- "send failed
      // on attempt 5" told nobody that the account's IP allowlist was
      // refusing a function that runs from a new address every call.
      await supabaseAdmin
        .from('email_outbox')
        .update({ status: 'failed', last_error: result.error ?? 'permanent failure' })
        .eq('id', row.id);
      failed++;
    } else {
      // Left pending: the attempt counter was already incremented by the
      // claim, and expire_failed_emails retires it once it runs out.
      await supabaseAdmin
        .from('email_outbox')
        .update({ last_error: result.error ?? `send failed on attempt ${row.attempts}` })
        .eq('id', row.id);
      failed++;
    }
  }

  if (failed > 0) await supabaseAdmin.rpc('expire_failed_emails');

  return jsonResponse({ ok: true, claimed: rows.length, sent, failed });
}

Deno.serve(handleRequest);
