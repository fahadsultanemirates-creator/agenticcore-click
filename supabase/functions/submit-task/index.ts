// AgenticCore Click — creates a real task from a service page submission.
// Authenticated. Computes the real price server-side (never trusts a
// client-supplied amount), debits the wallet atomically, then inserts the
// task. Every service page's "Generate"/"Submit" button calls this.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { REAL_TASK_TYPES } from '../_shared/pricing.ts';
import { placeOrder } from '../_shared/placeOrder.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

const TASK_TYPES = REAL_TASK_TYPES;

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

  const type = body?.type;
  const payload = body?.payload;
  const subtype = typeof body?.subtype === 'string' ? body.subtype : null;

  if (typeof type !== 'string' || !TASK_TYPES.has(type)) {
    return jsonResponse({ error: 'Invalid or missing type' }, 400);
  }
  if (!payload || typeof payload !== 'object') {
    return jsonResponse({ error: 'Missing payload' }, 400);
  }

  // One implementation of "take an order", shared with Forge and the
  // Telegram bot (_shared/placeOrder.ts). This used to be written out
  // here in full, and the copies drifted: the paused-account check landed
  // in two of the three only because all three were edited in one sitting.
  const result = await placeOrder({ userId: caller.id, type, payload, subtype, source: 'website' });

  if (!result.ok) {
    // The status matters to the dashboard: 402 puts up the top-up prompt,
    // 403 the set-a-password one, 400 sends them back to the form.
    const status =
      result.reason === 'insufficient_funds' ? 402 : result.reason === 'paused' ? 403 : result.reason === 'failed' ? 500 : 400;
    return jsonResponse({ error: result.message }, status);
  }

  return jsonResponse({
    taskId: result.taskId,
    publicId: result.publicId,
    priceUsd: result.priceUsd
  });
}

Deno.serve(handleRequest);
