// Opens a USDT invoice for a wallet top-up, and tells the client exactly
// what to send.
//
// The amount carries a nonce in its last four decimal places, which is the
// only thing identifying the payment -- there is one receiving address and
// no memo field. See _shared/usdtAmount.ts.
//
// Replaces payram-create-payment: PayRam charged about $15 of gas on every
// incoming transfer, against a flagship package of $20, and three test
// payments never arrived at all.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';
import { allocateNonce, invoiceAmount, MAX_NONCE } from '../_shared/usdtAmount.ts';
import { chainConfigured, RECEIVING_ADDRESS, USDT_CONTRACT, verifyContract } from '../_shared/usdtChain.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mirrors src/data/packages.ts, kept in sync by hand since the frontend is
// a static SPA with no shared build step with these functions. The dollars
// credited, not a credit system with a bonus.
const WALLET_TIERS: Record<string, number> = {
  'wallet-10': 10,
  'wallet-30': 30,
  'wallet-100': 100,
  'wallet-200': 200
};

/**
 * How long an invoice stays payable.
 *
 * Long enough to open a wallet, find the address and send; short enough
 * that an abandoned invoice gives its amount back rather than holding a
 * nonce forever. An expired invoice is not a lost payment -- money that
 * arrives late still appears in the sweep and is reported.
 */
const INVOICE_MINUTES = 60;

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  if (!chainConfigured()) {
    console.error('usdt-invoice: BSCSCAN_API_KEY is not set');
    return jsonResponse({ error: 'Crypto payment is not configured yet. Please try again shortly.' }, 503);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  const caller = await resolveCaller(authHeader);
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

  let body: { tier?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const tier = typeof body?.tier === 'string' ? body.tier : '';
  const baseUsd = WALLET_TIERS[tier];
  if (!baseUsd) return jsonResponse({ error: 'Unknown wallet package.' }, 400);

  // Before anything is quoted, confirm the contract we will watch really is
  // USDT. Watching a lookalike would credit somebody who paid in a
  // worthless token -- the one failure in this scheme that is not
  // fail-safe. Cheap, and it fails the request rather than the payment.
  let decimals: number;
  try {
    ({ decimals } = await verifyContract());
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('usdt-invoice: contract verification failed', detail);
    return jsonResponse(
      { error: 'Could not verify the payment token right now. Please try again shortly.', detail },
      503
    );
  }

  const expiresAt = new Date(Date.now() + INVOICE_MINUTES * 60_000).toISOString();

  // Nonce allocation reads the open invoices and then writes, so two
  // requests can read the same gap. The partial unique index on (amount)
  // where status = 'pending' is what actually prevents a collision; this
  // loop is how the loser of that race recovers.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data: open, error: readError } = await supabaseAdmin
      .from('usdt_invoices')
      .select('nonce')
      .eq('status', 'pending')
      .eq('base_usd', baseUsd);

    if (readError) {
      console.error('usdt-invoice: could not read open invoices', readError);
      return jsonResponse({ error: 'Could not open an invoice. Please try again.' }, 500);
    }

    let nonce: number;
    try {
      nonce = allocateNonce((open ?? []).map((row) => row.nonce as number));
    } catch {
      console.error(`usdt-invoice: all ${MAX_NONCE} nonces are in use at $${baseUsd}`);
      return jsonResponse({ error: 'Too many payments in progress. Please try again in a few minutes.' }, 503);
    }

    const amount = invoiceAmount(baseUsd, nonce);

    const { data: invoice, error: insertError } = await supabaseAdmin
      .from('usdt_invoices')
      .insert({ user_id: caller.id, base_usd: baseUsd, tier, amount, nonce, expires_at: expiresAt })
      .select('id, amount, expires_at')
      .single();

    if (!insertError && invoice) {
      return jsonResponse({
        invoiceId: invoice.id,
        // Everything the client needs to pay, and nothing they have to
        // work out: the exact amount matters more than the address, since
        // a near-miss on the amount is what cannot be attributed.
        amount: invoice.amount,
        address: RECEIVING_ADDRESS,
        contract: USDT_CONTRACT,
        network: 'BNB Smart Chain (BEP-20)',
        decimals,
        creditUsd: baseUsd,
        expiresAt: invoice.expires_at
      });
    }

    // 23505 is unique_violation: somebody took this amount between the read
    // and the write. Try the next free nonce.
    if ((insertError as { code?: string } | null)?.code !== '23505') {
      console.error('usdt-invoice: insert failed', insertError);
      return jsonResponse({ error: 'Could not open an invoice. Please try again.' }, 500);
    }
  }

  console.error('usdt-invoice: lost the nonce race five times running');
  return jsonResponse({ error: 'Could not open an invoice. Please try again.' }, 503);
}

Deno.serve(handleRequest);
