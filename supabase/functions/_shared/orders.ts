// Order identity: who ordered it, which of their orders it is, what product,
// and how many revisions it came with.
//
// A task used to carry one global number (AC-CLICK-0007), which names a task
// without describing it. "Revise my letterhead" needs more than a name: it
// needs to know which account is asking, which of that account's orders the
// letterhead is, and whether that product has any revisions left. Those are
// facts to be stored, not things a conversation can be trusted to remember.

import { resolveSku, getSku, type CatalogItem } from './catalog.ts';
import { supabaseAdmin } from './storage.ts';

export interface OrderIdentity {
  publicId: string;
  accountNo: number;
  orderNo: number;
  sku: number;
  revisionsAllowed: number;
}

// AC-1007-03 reads as "the third thing account 1007 ordered". Globally unique
// without a separate counter, because account numbers are unique and order
// numbers are unique within an account.
export function formatClientReference(accountNo: number, orderNo: number): string {
  return `AC-${accountNo}-${String(orderNo).padStart(2, '0')}`;
}

// The one reference pattern lives in orderMatch.ts (which stays free of any
// database import so it can be tested directly); re-exported here because
// this is where callers already look for it.
export { findReference as findTaskReference, REFERENCE_PATTERN as TASK_REFERENCE_PATTERN } from './orderMatch.ts';

// Allocates the next order number for a client and returns everything the task
// row needs to describe itself. revisionsAllowed is copied from the catalog at
// creation time rather than read live, so changing a product's allowance later
// never retroactively alters what an existing client was already sold.
export async function allocateClientOrder(
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<OrderIdentity | null> {
  const product = resolveSku(type, payload) ?? (typeof payload.sku === 'number' ? getSku(payload.sku) : null);
  if (!product) return null;

  const { data, error } = await supabaseAdmin.rpc('allocate_order', { p_user_id: userId }).maybeSingle();
  if (error || !data) {
    console.error('allocateClientOrder: allocate_order failed', error);
    return null;
  }

  const accountNo = Number(data.account_no);
  const orderNo = Number(data.order_no);

  return {
    publicId: formatClientReference(accountNo, orderNo),
    accountNo,
    orderNo,
    sku: product.sku,
    revisionsAllowed: product.revisions
  };
}

export interface RevisionVerdict {
  allowed: boolean;
  used: number;
  allowance: number;
  reason?: string;
}

// The single place that answers "can this be revised?". A website includes two
// revisions; an image product includes none, because it already came back as
// five options and choosing between them is the revision. Reads the allowance
// recorded on the task, falling back to the catalog for tasks created before
// allowances existed.
export function checkRevisionAllowance(task: {
  status: string;
  revisions_used?: number | null;
  revisions_allowed?: number | null;
  sku?: number | null;
  type: string;
  payload?: Record<string, unknown> | null;
}): RevisionVerdict {
  const product: CatalogItem | null =
    (task.sku != null ? getSku(task.sku) : null) ?? resolveSku(task.type, task.payload ?? {});

  const allowance = task.revisions_allowed ?? product?.revisions ?? 0;
  const used = task.revisions_used ?? 0;

  if (task.status !== 'delivered') {
    return {
      allowed: false,
      used,
      allowance,
      reason: `It isn't delivered yet (currently "${task.status}"), so there's nothing to revise.`
    };
  }

  if (allowance === 0) {
    const isImage = product?.renderer === 'images';
    return {
      allowed: false,
      used,
      allowance,
      reason: isImage
        ? `${product?.name ?? 'This product'} comes back as ${product?.output.options ?? 5} options to choose from rather than with revisions -- pick a different option, or order another one.`
        : `${product?.name ?? 'This product'} doesn't include revisions.`
    };
  }

  if (used >= allowance) {
    return {
      allowed: false,
      used,
      allowance,
      reason: `All ${allowance} included revision${allowance === 1 ? '' : 's'} for ${product?.name ?? 'this product'} have been used.`
    };
  }

  return { allowed: true, used, allowance };
}

// What Forge and the bot need to answer "what have I ordered?" without being
// told -- the account's real order book, newest first.
export interface OrderSummary {
  publicId: string;
  orderNo: number | null;
  /** The catalog number, so callers can match on product without re-querying. */
  sku: number | null;
  product: string;
  status: string;
  revisionsUsed: number;
  revisionsAllowed: number;
  createdAt: string;
  files: number;
}

const ORDER_COLUMNS =
  'public_id, order_no, sku, type, status, revisions_used, revisions_allowed, payload, created_at, task_files(count)';

function toSummaries(rows: any[]): OrderSummary[] {
  return rows.map((row: any) => {
    const product = (row.sku != null ? getSku(row.sku) : null) ?? resolveSku(row.type, row.payload ?? {});
    return {
      publicId: row.public_id,
      orderNo: row.order_no ?? null,
      sku: product?.sku ?? null,
      product: product?.name ?? row.type,
      status: row.status,
      revisionsUsed: row.revisions_used ?? 0,
      revisionsAllowed: row.revisions_allowed ?? product?.revisions ?? 0,
      createdAt: row.created_at,
      files: row.task_files?.[0]?.count ?? 0
    };
  });
}

export async function listAccountOrders(userId: string, limit = 25): Promise<OrderSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(ORDER_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listAccountOrders failed', error);
    return [];
  }
  return toSummaries(data ?? []);
}

// The owner's own tasks -- those raised from Telegram rather than bought
// through the dashboard. The bot resolves "that letterhead" against this the
// same way Forge resolves it against a client's order book.
export async function listOwnerTasks(limit = 25): Promise<OrderSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(ORDER_COLUMNS)
    .not('owner_channel_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listOwnerTasks failed', error);
    return [];
  }
  return toSummaries(data ?? []);
}

export interface RevisionResult {
  ok: boolean;
  message: string;
  revision?: number;
  allowance?: number;
  remaining?: number;
}

// Applies an included revision to a delivered order.
//
// Shared by the Telegram bot and Forge so a client and the owner get exactly
// the same answer to the same request. It used to exist only inside the bot's
// /revise handler, which meant a client talking to Forge could not revise
// anything at all -- they could only order the same thing again and pay twice.
export async function applyRevision(
  publicId: string,
  note: string,
  actor: 'owner' | 'client'
): Promise<RevisionResult> {
  const { data: task, error: fetchError } = await supabaseAdmin
    .from('tasks')
    .select('id, status, type, sku, version, revisions_used, revisions_allowed, payload')
    .eq('public_id', publicId)
    .maybeSingle();

  if (fetchError) {
    console.error('applyRevision: lookup failed', fetchError);
    return { ok: false, message: `Could not look up ${publicId}.` };
  }
  if (!task) return { ok: false, message: `No order found with reference ${publicId}.` };

  // A website includes two revisions; an image product includes none, because
  // it already came back as five options and choosing between them IS the
  // revision. The allowance lives on the task, so it reflects what this client
  // was sold rather than whatever the catalog says today.
  const verdict = checkRevisionAllowance(task);
  if (!verdict.allowed) {
    return { ok: false, message: `Can't revise ${publicId} — ${verdict.reason}` };
  }

  const revisionNo = verdict.used + 1;
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const priorNotes = Array.isArray(payload.revisionNotes) ? (payload.revisionNotes as string[]) : [];

  const { error: updateError } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'queued',
      revisions_used: revisionNo,
      // The version has to move, or the new files land on top of the old ones
      // at version 1 and the client can't tell which is the revision.
      version: (task.version ?? 1) + 1,
      // The note goes into the PAYLOAD, not just the audit log. It used to be
      // recorded in task_events only, which no worker reads -- so a revision
      // regenerated the original brief and came back materially unchanged.
      payload: { ...payload, revisionNotes: [...priorNotes, note] },
      updated_at: new Date().toISOString()
    })
    .eq('id', task.id);

  if (updateError) {
    console.error('applyRevision: update failed', updateError);
    return { ok: false, message: `Could not queue a revision for ${publicId}.` };
  }

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'revision_requested',
    actor,
    detail: { note, revision: revisionNo, allowance: verdict.allowance }
  });

  const remaining = verdict.allowance - revisionNo;
  return {
    ok: true,
    revision: revisionNo,
    allowance: verdict.allowance,
    remaining,
    message:
      `${publicId} re-queued for revision ${revisionNo} of ${verdict.allowance}` +
      (remaining > 0 ? ` (${remaining} left after this).` : ' (last one included).')
  };
}
