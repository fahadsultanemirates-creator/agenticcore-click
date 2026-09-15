// THE ACCOUNT DESK -- the one place that answers questions about accounts,
// balances and order books with stored facts.
//
// Forge and the Telegram bot are conversational: they are good at understanding
// what somebody means and bad at knowing what is true. Asked "how many
// revisions do I have left on my letterhead", a conversation can only recall
// what was said in it. That is not the same as what happened, and it is not
// the same as what the client is owed.
//
// So neither of them is allowed to answer an account question from memory.
// They ask here, and this file reads the database:
//
//   getAccountSnapshot     -- who this client is, what they've spent, what's open
//   resolveOrderReference  -- "my letterhead" / "the second one" -> a real order
//   accountBriefForPrompt  -- the above, compact, for the front line's prompt
//   getPlatformSnapshot    -- the owner's view: active accounts, balances, volume
//
// The recognition rules themselves live in orderMatch.ts, which is pure; this
// file only supplies the order book to match against.

import { getSku, resolveSku } from './catalog.ts';
import { matchOrder, type OrderMatch } from './orderMatch.ts';

export type { OrderMatch };
import { listAccountOrders, listOwnerTasks, checkRevisionAllowance, type OrderSummary } from './orders.ts';
import { supabaseAdmin } from './storage.ts';

export interface AccountSnapshot {
  userId: string;
  accountNo: number | null;
  balanceUsd: number;
  ordersTotal: number;
  ordersByStatus: Record<string, number>;
  /** Delivered orders that still have at least one revision left. */
  revisableOrders: number;
  lastOrderAt: string | null;
}

export async function getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  const [{ data: account }, { data: wallet }, { data: rows }] = await Promise.all([
    supabaseAdmin.from('client_accounts').select('account_no').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('wallets').select('balance_usd').eq('user_id', userId).maybeSingle(),
    supabaseAdmin
      .from('tasks')
      .select('status, sku, type, payload, revisions_used, revisions_allowed, created_at')
      .eq('user_id', userId)
  ]);

  const tasks = rows ?? [];
  const ordersByStatus: Record<string, number> = {};
  let revisableOrders = 0;
  let lastOrderAt: string | null = null;

  for (const task of tasks as any[]) {
    ordersByStatus[task.status] = (ordersByStatus[task.status] ?? 0) + 1;
    if (checkRevisionAllowance(task).allowed) revisableOrders++;
    if (!lastOrderAt || task.created_at > lastOrderAt) lastOrderAt = task.created_at;
  }

  return {
    userId,
    accountNo: account?.account_no ?? null,
    balanceUsd: wallet ? Number(wallet.balance_usd) : 0,
    ordersTotal: tasks.length,
    ordersByStatus,
    revisableOrders,
    lastOrderAt
  };
}

export async function resolveOrderReference(userId: string, text: string): Promise<OrderMatch> {
  return matchOrder(await listAccountOrders(userId, 50), text);
}

export async function resolveOwnerTaskReference(text: string): Promise<OrderMatch> {
  return matchOrder(await listOwnerTasks(50), text);
}

function revisionPhrase(order: OrderSummary): string {
  if (order.revisionsAllowed === 0) return 'no revisions included';
  const left = Math.max(0, order.revisionsAllowed - order.revisionsUsed);
  return `${left} of ${order.revisionsAllowed} revision${order.revisionsAllowed === 1 ? '' : 's'} left`;
}

// The account's real state, written for a system prompt. Given to Forge and
// the bot every turn so "what did I order?" and "can this be revised?" are
// answered from the order book in front of them, not from the conversation.
export async function accountBriefForPrompt(userId: string): Promise<string> {
  const [snapshot, orders] = await Promise.all([getAccountSnapshot(userId), listAccountOrders(userId, 15)]);

  const header =
    `THIS CLIENT'S ACCOUNT (live data -- trust this over anything said earlier in the conversation):\n` +
    `Account number: ${snapshot.accountNo ?? 'not yet assigned (no orders placed)'}\n` +
    `Wallet balance: $${snapshot.balanceUsd.toFixed(2)}\n` +
    `Orders placed: ${snapshot.ordersTotal}`;

  if (orders.length === 0) {
    return `${header}\nThis client has not ordered anything yet, so there is nothing to revise or ask about.`;
  }

  const book = orders
    .map((o) => `- ${o.publicId} — ${o.product} — ${o.status} — ${revisionPhrase(o)}`)
    .join('\n');

  return (
    `${header}\n\nTheir order book, newest first:\n${book}\n\n` +
    `Use these exact reference numbers when you talk about an order. When the client refers to something ` +
    `vaguely ("my letterhead", "the second one"), match it against this list rather than asking them for a ` +
    `reference number -- they do not know their reference numbers and should never be asked to look one up. ` +
    `If two entries fit equally well, name both and ask which one they mean. Never claim a revision is ` +
    `available for an order this list says has none left.`
  );
}

export interface PlatformSnapshot {
  accountsTotal: number;
  accountsWithBalance: number;
  accountsActive30d: number;
  balanceHeldUsd: number;
  tasksTotal: number;
  tasksDelivered: number;
  tasksInFlight: number;
  tasksFailed: number;
  tasksNeedingInfo: number;
  topProducts: { sku: number; name: string; count: number }[];
}

// The owner's view of the whole platform: how many accounts exist, how many
// are funded, and how much work has actually been delivered. Feeds the daily
// summary and any "how are we doing" question in the bot.
export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  const [{ count: accountsTotal }, { data: wallets }, { data: tasks }] = await Promise.all([
    supabaseAdmin.from('client_accounts').select('user_id', { count: 'exact', head: true }),
    supabaseAdmin.from('wallets').select('user_id, balance_usd'),
    supabaseAdmin.from('tasks').select('status, sku, type, payload, user_id, created_at')
  ]);

  const funded = (wallets ?? []).filter((w: any) => Number(w.balance_usd) > 0);
  const balanceHeldUsd = funded.reduce((sum: number, w: any) => sum + Number(w.balance_usd), 0);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const activeUsers = new Set<string>();
  const byProduct = new Map<number, number>();
  let tasksDelivered = 0;
  let tasksInFlight = 0;
  let tasksFailed = 0;
  let tasksNeedingInfo = 0;

  for (const task of (tasks ?? []) as any[]) {
    if (task.user_id && task.created_at >= since) activeUsers.add(task.user_id);
    if (task.status === 'delivered') tasksDelivered++;
    else if (task.status === 'failed') tasksFailed++;
    else if (task.status === 'needs_info') tasksNeedingInfo++;
    else tasksInFlight++;

    const item = (task.sku != null ? getSku(task.sku) : null) ?? resolveSku(task.type, task.payload ?? {});
    if (item) byProduct.set(item.sku, (byProduct.get(item.sku) ?? 0) + 1);
  }

  const topProducts = [...byProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, count]) => ({ sku, name: getSku(sku)?.name ?? String(sku), count }));

  return {
    accountsTotal: accountsTotal ?? 0,
    accountsWithBalance: funded.length,
    accountsActive30d: activeUsers.size,
    balanceHeldUsd,
    tasksTotal: (tasks ?? []).length,
    tasksDelivered,
    tasksInFlight,
    tasksFailed,
    tasksNeedingInfo,
    topProducts
  };
}
