// AgenticCore Click — receives PayRam payment-confirmed events relayed
// from .agency. .click's payments share .agency's single PayRam
// account/webhook registration, so PayRam itself never calls this
// endpoint directly: PayRam calls .agency, .agency verifies the real
// HMAC signature (see its own payram-webhook/index.ts) and, seeing an
// invoice_id prefixed "click-", forwards the raw body here unmodified.
//
// Trust boundary: this function does NOT re-verify a PayRam signature
// (it never received the raw PayRam request) -- it verifies the
// X-Internal-Relay-Secret header instead, proving the call came from
// .agency's relay and not an arbitrary POST to this public endpoint.
// Public endpoint (verify_jwt = false in ../../config.toml), same
// reasoning as .agency's own payram-webhook and telegram-webhook.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLICK_INTERNAL_RELAY_SECRET = Deno.env.get('CLICK_INTERNAL_RELAY_SECRET')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CONFIRMING_STATUSES = new Set(['FILLED', 'OVER_FILLED']);

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const relaySecret = req.headers.get('X-Internal-Relay-Secret');
  if (!relaySecret || !constantTimeEqual(relaySecret, CLICK_INTERNAL_RELAY_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const invoiceId = payload?.invoice_id;
  const status = payload?.status;

  if (!invoiceId || typeof invoiceId !== 'string') {
    return new Response('ok');
  }

  if (!CONFIRMING_STATUSES.has(status)) {
    return new Response('ok');
  }

  const { data: topup, error: fetchError } = await supabaseAdmin
    .from('wallet_topups')
    .select('id, user_id, tier, amount_usd, status')
    .eq('invoice_id', invoiceId)
    .maybeSingle();

  if (fetchError) {
    console.error('payram-webhook: wallet_topups lookup errored', { invoiceId, fetchError });
    return new Response('Database error', { status: 500 });
  }
  if (!topup) {
    console.error('payram-webhook: no wallet_topups row for invoice_id', invoiceId);
    return new Response('ok');
  }

  // Idempotent -- a retried relay for an already-confirmed top-up must
  // not credit the wallet twice.
  if (topup.status === 'confirmed') {
    return new Response('ok');
  }

  // The .eq('status', 'pending') guard plus checking rows actually
  // matched (via .select()) is what makes this safe against a retried
  // relay call: only the request that actually flips pending->confirmed
  // goes on to credit the wallet, so a duplicate delivery for the same
  // topup can't double-credit it.
  const { data: updatedTopup, error: topupUpdateError } = await supabaseAdmin
    .from('wallet_topups')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', topup.id)
    .eq('status', 'pending')
    .select('id');

  if (topupUpdateError) {
    console.error('payram-webhook: wallet_topups update failed', { invoiceId, topupUpdateError });
    return new Response('Database error', { status: 500 });
  }
  if (!updatedTopup || updatedTopup.length === 0) {
    // Lost the race to another concurrent delivery -- it already credited the wallet.
    return new Response('ok');
  }

  const { error: creditError } = await supabaseAdmin.rpc('increment_wallet_balance', {
    p_user_id: topup.user_id,
    p_amount: topup.amount_usd,
    p_tier: topup.tier
  });

  if (creditError) {
    console.error('payram-webhook: wallet credit failed', { invoiceId, creditError });
    return new Response('Database error', { status: 500 });
  }

  return new Response('ok');
}

Deno.serve(handleRequest);
