// Actually creates the task(s) a Forge conversation drafted, once the
// client has explicitly confirmed in the UI. Deliberately separate from
// forge-chat -- forge-chat only ever proposes, this is the one place that
// touches money and inserts real rows, mirroring submit-task's exact
// pricing/wallet-debit pattern (never trusts a client-supplied price).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { calculatePriceUsd, REAL_TASK_TYPES, FULL_BUSINESS_SETUP_USD } from '../_shared/pricing.ts';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';
import { allocateClientOrder } from '../_shared/orders.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

interface TaskInput {
  type: string;
  subtype?: string | null;
  payload: Record<string, unknown>;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const caller = await resolveCaller(authHeader);
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;
  const isBundle = body?.bundle === true;
  const rawTasks: unknown = body?.tasks;

  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return jsonResponse({ error: 'No tasks to submit' }, 400);
  }
  if (rawTasks.length > 25) {
    return jsonResponse({ error: 'Too many tasks in one submission' }, 400);
  }

  const tasks: TaskInput[] = [];
  for (const raw of rawTasks) {
    const type = raw?.type;
    const payload = raw?.payload;
    if (typeof type !== 'string' || !REAL_TASK_TYPES.has(type)) {
      return jsonResponse({ error: `Invalid task type: ${String(type)}` }, 400);
    }
    if (!payload || typeof payload !== 'object') {
      return jsonResponse({ error: 'Missing payload on one of the tasks' }, 400);
    }
    tasks.push({ type, subtype: typeof raw?.subtype === 'string' ? raw.subtype : null, payload });
  }

  let totalUsd: number;
  if (isBundle) {
    totalUsd = FULL_BUSINESS_SETUP_USD;
  } else {
    let sum = 0;
    for (const t of tasks) {
      const price = calculatePriceUsd(t.type, t.payload);
      if (price === null) {
        return jsonResponse({ error: `Could not price a "${t.type}" task -- check the details gathered for it.` }, 400);
      }
      sum += price;
    }
    totalUsd = sum;
  }

  const { data: debited, error: debitError } = await supabaseAdmin.rpc('deduct_wallet_balance', {
    p_user_id: caller.id,
    p_amount: totalUsd
  });
  if (debitError) {
    console.error('forge-submit: wallet debit errored', debitError);
    return jsonResponse({ error: 'Could not process wallet payment. Please try again.' }, 500);
  }
  if (!debited) {
    return jsonResponse({ error: `Insufficient wallet balance. This costs $${totalUsd}.` }, 402);
  }

  const bundleId = isBundle ? crypto.randomUUID() : null;
  const publicIds: string[] = [];
  let anchorTaskId: string | null = null;
  let insertFailed = false;

  for (const t of tasks) {
    const payload = bundleId ? { ...t.payload, bundleId } : t.payload;

    const identity = await allocateClientOrder(caller.id, t.type, payload);
    if (!identity) {
      console.error('forge-submit: could not identify product for', t.type);
      insertFailed = true;
      break;
    }

    const { data: task, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert({
        public_id: identity.publicId,
        source: 'website',
        type: t.type,
        subtype: t.subtype,
        status: 'queued',
        wallet_confirmed: true,
        user_id: caller.id,
        account_no: identity.accountNo,
        order_no: identity.orderNo,
        sku: identity.sku,
        revisions_allowed: identity.revisionsAllowed,
        parent_task_id: anchorTaskId,
        payload
      })
      .select('id, public_id')
      .single();

    if (insertError || !task) {
      console.error('forge-submit: task insert failed', insertError);
      insertFailed = true;
      break;
    }

    if (!anchorTaskId) anchorTaskId = task.id;
    publicIds.push(task.public_id);

    await supabaseAdmin.from('task_events').insert({
      task_id: task.id,
      event_type: 'created',
      actor: 'client',
      detail: { price_usd: isBundle ? null : calculatePriceUsd(t.type, t.payload), type: t.type, subtype: t.subtype, bundle: isBundle, conversationId }
    });
  }

  if (insertFailed) {
    // Refund -- the debit already happened but not every task made it in.
    await supabaseAdmin.rpc('refund_wallet_balance', { p_user_id: caller.id, p_amount: totalUsd });
    return jsonResponse({ error: 'Could not create all the tasks. Your wallet was not charged.' }, 500);
  }

  // Keep the conversation going rather than resetting it -- the client can
  // keep chatting (ask about what they just queued, start another request)
  // with real memory of what happened, instead of Forge "forgetting"
  // everything the moment something gets confirmed. The confirmation itself
  // is persisted as an assistant message so it's part of that memory too.
  if (conversationId) {
    await supabaseAdmin.from('forge_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', caller.id);
    await supabaseAdmin.from('forge_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: `Queued: ${publicIds.join(', ')} -- $${totalUsd.toFixed(2)} charged from the wallet. The team will notify you as each one is ready.`
    });
  }

  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('forge-submit: dispatch trigger failed', err));

  return jsonResponse({ publicIds, totalCharged: totalUsd });
}

Deno.serve(handleRequest);
