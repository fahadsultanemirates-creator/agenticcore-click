// AgenticCore Click — polls PayRam directly for a wallet top-up's status,
// using .click's own API key. Deliberately bypasses .agency's webhook
// relay entirely: PayRam only calls .agency's registered webhook URL, and
// that relay chain (across two separate Supabase projects/accounts, with
// its own deploy step that's easy to forget) proved too fragile to depend
// on for something as time-sensitive as crediting a wallet. This function
// is self-contained to .click -- no dependency on .agency's code or
// secrets at all.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYRAM_API_KEY = Deno.env.get('PAYRAM_API_KEY')!;
const PAYRAM_BASE_URL = Deno.env.get('PAYRAM_BASE_URL')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

// Matches PayRam's documented paymentState values exactly (same enum the
// webhook payload's status field uses, confirmed against docs.payram.com).
const CONFIRMING_STATES = new Set(['FILLED', 'OVER_FILLED']);
const TERMINAL_FAILURE_STATES = new Set(['CANCELLED']);

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const caller = await resolveCaller(authHeader);
  if (!caller) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const invoiceId = body?.invoiceId;
  if (typeof invoiceId !== 'string' || !invoiceId) {
    return jsonResponse({ error: 'Missing invoiceId' }, 400);
  }

  // Ownership check via user_id, not just invoice_id -- never let one
  // user poll (or, worse, trigger a credit for) another user's topup.
  const { data: topup, error: fetchError } = await supabaseAdmin
    .from('wallet_topups')
    .select('id, user_id, tier, amount_usd, status, reference_id')
    .eq('invoice_id', invoiceId)
    .eq('user_id', caller.id)
    .maybeSingle();

  if (fetchError) {
    console.error('payram-check-status: wallet_topups lookup errored', fetchError);
    return jsonResponse({ error: 'Could not check payment status. Please try again.' }, 500);
  }
  if (!topup) {
    return jsonResponse({ error: 'Top-up not found' }, 404);
  }

  if (topup.status === 'confirmed') {
    return jsonResponse({ status: 'confirmed' });
  }

  if (!topup.reference_id) {
    console.error('payram-check-status: topup has no reference_id', { invoiceId });
    return jsonResponse({ status: 'pending' });
  }

  let payramResp: Response;
  try {
    payramResp = await fetch(`${PAYRAM_BASE_URL}/api/v1/payment/reference/${topup.reference_id}`, {
      headers: { 'API-Key': PAYRAM_API_KEY }
    });
  } catch (err) {
    console.error('payram-check-status: PayRam network error', err);
    return jsonResponse({ error: 'Could not reach the payment provider. Please try again.' }, 502);
  }

  if (!payramResp.ok) {
    const text = await payramResp.text().catch(() => '');
    console.error(`payram-check-status: PayRam status check failed (${payramResp.status}):`, text.slice(0, 500));
    return jsonResponse({ error: 'Could not check payment status. Please try again.' }, 502);
  }

  const payramData = await payramResp.json().catch(() => null);
  const paymentState = payramData?.paymentState;

  if (TERMINAL_FAILURE_STATES.has(paymentState)) {
    return jsonResponse({ status: 'cancelled' });
  }

  if (!CONFIRMING_STATES.has(paymentState)) {
    return jsonResponse({ status: 'pending' });
  }

  // Same idempotency pattern as the old webhook: only the request that
  // actually flips pending->confirmed goes on to credit the wallet, so a
  // duplicate poll landing at the same moment can't double-credit it.
  const { data: updatedTopup, error: topupUpdateError } = await supabaseAdmin
    .from('wallet_topups')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', topup.id)
    .eq('status', 'pending')
    .select('id');

  if (topupUpdateError) {
    console.error('payram-check-status: wallet_topups update failed', topupUpdateError);
    return jsonResponse({ error: 'Could not confirm the top-up. Please try again.' }, 500);
  }
  if (!updatedTopup || updatedTopup.length === 0) {
    // Another concurrent poll already confirmed it.
    return jsonResponse({ status: 'confirmed' });
  }

  const { error: creditError } = await supabaseAdmin.rpc('increment_wallet_balance', {
    p_user_id: topup.user_id,
    p_amount: topup.amount_usd,
    p_tier: topup.tier
  });

  if (creditError) {
    console.error('payram-check-status: wallet credit failed', creditError);
    return jsonResponse({ error: 'Payment confirmed but crediting the wallet failed. Contact support.' }, 500);
  }

  return jsonResponse({ status: 'confirmed' });
}

Deno.serve(handleRequest);
