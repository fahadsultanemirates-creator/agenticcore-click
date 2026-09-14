// AgenticCore Click — creates a real task from a service page submission.
// Authenticated. Computes the real price server-side (never trusts a
// client-supplied amount), debits the wallet atomically, then inserts the
// task. Every service page's "Generate"/"Submit" button calls this.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculatePriceUsd, REAL_TASK_TYPES } from '../_shared/pricing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

const TASK_TYPES = REAL_TASK_TYPES;

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

// A video payload may name a specific avatar/voice (catalog pick or the
// caller's own custom one) instead of relying on the house default --
// verified against the DB here, before any charge, so a client can never
// smuggle in someone else's custom avatar_id/talking_photo_id/voice_id by
// hand-crafting the payload. Absent avatarProviderId/voiceProviderId is
// fine (falls back to the house default in worker-video).
async function validateVideoCharacterChoice(callerId: string, payload: Record<string, unknown>): Promise<string | null> {
  if (payload.avatarStyle === 'none') return null;

  const checks: { source: unknown; providerId: unknown; kind: 'avatar' | 'voice'; label: string }[] = [
    { source: payload.avatarSource, providerId: payload.avatarProviderId, kind: 'avatar', label: 'avatar' },
    { source: payload.voiceSource, providerId: payload.voiceProviderId, kind: 'voice', label: 'voice' }
  ];

  for (const check of checks) {
    if (!check.providerId) continue;
    if (typeof check.providerId !== 'string') return `Invalid ${check.label} selection.`;

    if (check.source === 'custom') {
      const { data } = await supabaseAdmin
        .from('client_avatars')
        .select('id')
        .eq('user_id', callerId)
        .eq('kind', check.kind)
        .eq('provider_id', check.providerId)
        .eq('status', 'ready')
        .maybeSingle();
      if (!data) return `Selected ${check.label} isn't ready or doesn't belong to you.`;
    } else if (check.source === 'catalog') {
      const { data } = await supabaseAdmin
        .from('catalog_options')
        .select('id')
        .eq('kind', check.kind)
        .eq('provider_id', check.providerId)
        .eq('active', true)
        .maybeSingle();
      if (!data) return `Selected ${check.label} is no longer available.`;
    } else {
      return `Invalid ${check.label} selection.`;
    }
  }

  return null;
}

async function generatePublicId(): Promise<string> {
  const { count } = await supabaseAdmin.from('tasks').select('*', { count: 'exact', head: true });
  const base = (count ?? 0) + 1;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `AC-CLICK-${String(base + attempt).padStart(4, '0')}`;
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('public_id', candidate)
      .maybeSingle();
    if (!existing) return candidate;
  }

  // Extremely unlikely fallback -- a random suffix guarantees uniqueness
  // even if five sequential slots were all raced simultaneously.
  return `AC-CLICK-${String(base).padStart(4, '0')}-${crypto.randomUUID().slice(0, 4)}`;
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

  const priceUsd = calculatePriceUsd(type, payload);
  if (priceUsd === null) {
    return jsonResponse({ error: 'Could not price this request — check the selected options.' }, 400);
  }

  if (type === 'video') {
    const characterError = await validateVideoCharacterChoice(caller.id, payload);
    if (characterError) {
      return jsonResponse({ error: characterError }, 400);
    }
  }

  const { data: debited, error: debitError } = await supabaseAdmin.rpc('deduct_wallet_balance', {
    p_user_id: caller.id,
    p_amount: priceUsd
  });

  if (debitError) {
    console.error('submit-task: wallet debit errored', debitError);
    return jsonResponse({ error: 'Could not process wallet payment. Please try again.' }, 500);
  }
  if (!debited) {
    return jsonResponse({ error: `Insufficient wallet balance. This request costs $${priceUsd}.` }, 402);
  }

  const publicId = await generatePublicId();

  const { data: task, error: insertError } = await supabaseAdmin
    .from('tasks')
    .insert({
      public_id: publicId,
      source: 'website',
      type,
      subtype,
      status: 'queued',
      wallet_confirmed: true,
      user_id: caller.id,
      payload
    })
    .select('id, public_id')
    .single();

  if (insertError || !task) {
    console.error('submit-task: task insert failed', insertError);
    // Refund -- the debit already happened but the task never got created.
    await supabaseAdmin.rpc('refund_wallet_balance', { p_user_id: caller.id, p_amount: priceUsd });
    return jsonResponse({ error: 'Could not create the task. Your wallet was not charged.' }, 500);
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    actor: 'client',
    detail: { price_usd: priceUsd, type, subtype }
  });

  // Fire-and-forget -- nudges the dispatcher so this task doesn't wait for
  // the cron safety net. Never awaited: a dispatch hiccup here is not a
  // reason to fail a request that already succeeded and was charged.
  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('submit-task: dispatch trigger failed', err));

  return jsonResponse({ taskId: task.id, publicId: task.public_id, priceUsd });
}

Deno.serve(handleRequest);
