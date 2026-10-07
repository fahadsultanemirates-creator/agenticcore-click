// Taking an order. One implementation, three front doors.
//
// A service page, Forge, and now the Telegram bot all sell the same
// products out of the same wallet, and each of them has to: refuse a
// paused account, price the request server-side, debit atomically, give
// the order its identity, insert the task, log it, send the receipt, and
// nudge the dispatcher. Seven steps, in that order, with a refund on every
// failure past the debit.
//
// Written out three times, the copies drift -- and the way they drift is
// not "one is slower", it is "one of them takes the money and loses the
// order". submit-task and forge-submit grew the paused-account check
// separately and only because both were edited in the same hour.
//
// The price is computed here from the payload, never read from the
// caller. That is the rule this module exists to make unskippable: a bot
// message, like a browser request, is a thing the client controls.
import { getSku } from './catalog.ts';
import { applyDiscount, type DiscountContext, type PricedOrder } from './discount.ts';
import { queueEmailForUser } from './email.ts';
import { allocateClientOrder } from './orders.ts';
import { calculatePriceUsd, REAL_TASK_TYPES } from './pricing.ts';
import { supabaseAdmin } from './storage.ts';
import { triggerDispatch } from './task.ts';

export type OrderSource = 'website' | 'telegram';

export type PlaceOrderFailure =
  | 'unknown_type'
  | 'paused'
  | 'unpriceable'
  | 'insufficient_funds'
  | 'unidentified_product'
  | 'failed';

export type PlaceOrderResult =
  | {
      ok: true;
      taskId: string;
      publicId: string;
      /** What was actually debited, after any discount. */
      priceUsd: number;
      /** Before the discount, for a receipt that shows the saving. */
      listUsd: number;
      discountPct: number;
      productName: string;
    }
  | { ok: false; reason: PlaceOrderFailure; priceUsd?: number; message: string };

export interface PlaceOrderInput {
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  subtype?: string | null;
  source: OrderSource;
}

export const PAUSED_MESSAGE =
  'Your account is paused until you set a password. Send /login to the Telegram bot for a code, ' +
  'then set one at https://agenticcore.click/claim.';

/** True when this account may not place new orders. */
export async function accountPaused(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('telegram_account_paused', { p_user_id: userId });
  if (error) {
    // Fail open. A client who set their password months ago must not be
    // refused because one RPC was briefly unreachable; the pause is a
    // prompt, not a security boundary.
    console.error(`accountPaused(${userId}) failed:`, error);
    return false;
  }
  return data === true;
}

/** What this request costs, or null if the payload does not describe a real product. */
export function priceFor(type: string, payload: Record<string, unknown>): number | null {
  if (!REAL_TASK_TYPES.has(type)) return null;
  return calculatePriceUsd(type, payload);
}

/**
 * Which discount this account is entitled to right now.
 *
 * Two facts, neither of them stored as a discount: the tier that last
 * funded the wallet, and whether any order has been placed. An account
 * with no client_accounts row has never ordered -- the row is created by
 * allocate_order, so its absence is the first-order signal rather than
 * something to track separately.
 */
export async function discountContextFor(userId: string): Promise<DiscountContext> {
  const [{ data: wallet }, { data: account }] = await Promise.all([
    supabaseAdmin.from('wallets').select('tier').eq('user_id', userId).maybeSingle<{ tier: string | null }>(),
    supabaseAdmin
      .from('client_accounts')
      .select('next_order_no')
      .eq('user_id', userId)
      .maybeSingle<{ next_order_no: number }>()
  ]);

  return {
    tier: wallet?.tier ?? null,
    isFirstOrder: (account?.next_order_no ?? 1) <= 1
  };
}

/**
 * The full price of a request: list, discount, and what will be charged.
 *
 * Exported because every path that QUOTES has to use the same function
 * that CHARGES. Quote at list and charge at the discount and the two
 * disagree -- which the confirmation guard then reads as a price change
 * and refuses, blocking every order.
 */
export async function quoteFor(
  userId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<PricedOrder | null> {
  const listUsd = priceFor(type, payload);
  if (listUsd === null) return null;
  return applyDiscount(listUsd, await discountContextFor(userId));
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { userId, type, payload, source } = input;
  const subtype = input.subtype ?? null;

  if (!REAL_TASK_TYPES.has(type)) {
    return { ok: false, reason: 'unknown_type', message: 'That is not something we sell.' };
  }

  if (await accountPaused(userId)) {
    return { ok: false, reason: 'paused', message: PAUSED_MESSAGE };
  }

  const listUsd = calculatePriceUsd(type, payload);
  if (listUsd === null) {
    return {
      ok: false,
      reason: 'unpriceable',
      message: 'Could not price this request — check the selected options.'
    };
  }

  // Read BEFORE the order is allocated. allocate_order increments
  // next_order_no, so asking afterwards would always say "not the first
  // order" and the first-order discount would never once apply.
  const priced = applyDiscount(listUsd, await discountContextFor(userId));
  const priceUsd = priced.chargeUsd;

  const { data: debited, error: debitError } = await supabaseAdmin.rpc('deduct_wallet_balance', {
    p_user_id: userId,
    p_amount: priceUsd
  });

  if (debitError) {
    console.error('placeOrder: wallet debit errored', debitError);
    return { ok: false, reason: 'failed', priceUsd, message: 'Could not process wallet payment. Please try again.' };
  }
  if (!debited) {
    return {
      ok: false,
      reason: 'insufficient_funds',
      priceUsd,
      message: `Insufficient wallet balance. This request costs $${priceUsd.toFixed(2)}.`
    };
  }

  // Past here the money is gone, so every exit refunds it.
  const identity = await allocateClientOrder(userId, type, payload);
  if (!identity) {
    await refund(userId, priceUsd);
    return {
      ok: false,
      reason: 'unidentified_product',
      priceUsd,
      message: 'Could not identify the product for this request. Your wallet was not charged.'
    };
  }

  const { data: task, error: insertError } = await supabaseAdmin
    .from('tasks')
    .insert({
      public_id: identity.publicId,
      source,
      type,
      subtype,
      status: 'queued',
      wallet_confirmed: true,
      user_id: userId,
      account_no: identity.accountNo,
      order_no: identity.orderNo,
      sku: identity.sku,
      revisions_allowed: identity.revisionsAllowed,
      payload
    })
    .select('id, public_id')
    .single<{ id: string; public_id: string }>();

  if (insertError || !task) {
    console.error('placeOrder: task insert failed', insertError);
    await refund(userId, priceUsd);
    return { ok: false, reason: 'failed', priceUsd, message: 'Could not create the task. Your wallet was not charged.' };
  }

  const productName = getSku(identity.sku)?.name ?? type;

  await supabaseAdmin.from('task_events').insert({
    task_id: task.id,
    event_type: 'created',
    actor: 'client',
    detail: {
      price_usd: priceUsd,
      list_usd: priced.listUsd,
      discount_pct: priced.discountPct,
      discount_reason: priced.reason,
      type,
      subtype,
      sku: identity.sku,
      revisions_allowed: identity.revisionsAllowed,
      source
    }
  });

  await queueEmailForUser(userId, 'order_placed', {
    publicId: identity.publicId,
    productName,
    priceUsd
  });

  triggerDispatch();

  return {
    ok: true,
    taskId: task.id,
    publicId: identity.publicId,
    priceUsd,
    listUsd: priced.listUsd,
    discountPct: priced.discountPct,
    productName
  };
}

async function refund(userId: string, amount: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc('refund_wallet_balance', { p_user_id: userId, p_amount: amount });
  if (error) {
    // The one failure in here that costs a client real money, so it is
    // logged loudly rather than swallowed with the rest.
    console.error(`placeOrder: REFUND FAILED for ${userId}, $${amount} -- needs a manual credit`, error);
  }
}

/** The wallet balance, for deciding whether to offer a top-up. */
export async function walletBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .select('balance_usd')
    .eq('user_id', userId)
    .maybeSingle<{ balance_usd: number }>();
  if (error) {
    console.error(`walletBalance(${userId}) failed:`, error);
    return 0;
  }
  return Number(data?.balance_usd ?? 0);
}
