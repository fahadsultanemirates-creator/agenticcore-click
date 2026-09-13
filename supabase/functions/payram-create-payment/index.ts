// AgenticCore Click — creates a PayRam payment link for a wallet
// top-up. Authenticated: resolves the caller's real identity from their
// own session token, same pattern as .agency's payram-create-payment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYRAM_API_KEY = Deno.env.get('PAYRAM_API_KEY')!;
const PAYRAM_BASE_URL = Deno.env.get('PAYRAM_BASE_URL')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Mirrors src/data/packages.ts -- kept in sync by hand since the
// frontend is a static SPA with no shared build step with these
// functions. amountUsd is the literal dollars credited, not a credit
// system with a bonus multiplier.
const WALLET_TIERS: Record<string, number> = {
  'wallet-10': 10,
  'wallet-30': 30,
  'wallet-100': 100,
  'wallet-200': 200
};

const INVOICE_PREFIX = 'click-';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

async function resolveCaller(authHeader: string): Promise<{ id: string; email: string | null } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
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

  const tier = body?.tier;
  const amountUsd = typeof tier === 'string' ? WALLET_TIERS[tier] : undefined;
  if (!amountUsd) {
    return jsonResponse({ error: 'Invalid or missing tier' }, 400);
  }

  const invoiceId = `${INVOICE_PREFIX}${crypto.randomUUID()}`;

  const { error: insertError } = await supabaseAdmin.from('wallet_topups').insert({
    user_id: caller.id,
    invoice_id: invoiceId,
    tier,
    amount_usd: amountUsd,
    status: 'pending'
  });

  if (insertError) {
    console.error('payram-create-payment: wallet_topups insert failed', insertError);
    return jsonResponse({ error: 'Could not start the top-up. Please try again.' }, 500);
  }

  let payramResp: Response;
  try {
    payramResp = await fetch(`${PAYRAM_BASE_URL}/api/v1/payment`, {
      method: 'POST',
      headers: {
        'API-Key': PAYRAM_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerEmail: caller.email,
        customerID: caller.id,
        amountInUSD: amountUsd,
        invoiceID: invoiceId
      })
    });
  } catch (err) {
    console.error('PayRam create-payment network error:', err);
    return jsonResponse({ error: 'Could not reach the payment provider. Please try again in a moment.' }, 502);
  }

  if (!payramResp.ok) {
    const text = await payramResp.text().catch(() => '');
    console.error(`PayRam create-payment failed (${payramResp.status}):`, text.slice(0, 500));
    return jsonResponse({ error: 'Could not create a payment link. Please try again in a moment.' }, 502);
  }

  const payramData = await payramResp.json().catch(() => null);
  const paymentUrl = payramData?.url;

  if (!paymentUrl) {
    console.error('PayRam create-payment response missing url:', JSON.stringify(payramData));
    return jsonResponse({ error: 'Payment provider returned an unexpected response.' }, 502);
  }

  return jsonResponse({ url: paymentUrl, amountUsd, invoiceId });
}

Deno.serve(handleRequest);
