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
//
// The work itself lives in _shared/usdtInvoice.ts, because the Telegram
// bot opens invoices too and a client who signed up in the chat has no
// website password yet -- "go to the dashboard" is a dead end for exactly
// the people most likely to be ordering from a chat. This file is the
// authenticated HTTP door onto it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';
import { chainConfigured } from '../_shared/usdtChain.ts';
import { createUsdtInvoice, WALLET_TIERS } from '../_shared/usdtInvoice.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

  const result = await createUsdtInvoice(caller.id, tier);
  if (!result.ok) {
    return jsonResponse(result.detail ? { error: result.error, detail: result.detail } : { error: result.error }, result.status);
  }
  return jsonResponse(result.invoice);
}

Deno.serve(handleRequest);
