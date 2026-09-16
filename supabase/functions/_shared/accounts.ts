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
  /** People who have signed up, whether or not they have ordered anything. */
  registeredUsers: number;
  /** Accounts that have been issued a number -- i.e. have ordered at least once. */
  accountsWithOrderNumber: number;
  accountsWithBalance: number;
  accountsActive30d: number;
  balanceHeldUsd: number;
  tasksTotal: number;
  tasksDelivered: number;
  tasksInFlight: number;
  tasksFailed: number;
  tasksNeedingInfo: number;
  topProducts: { sku: number; name: string; count: number }[];
  /** Today and this week, because an all-time total alone says nothing about
      whether the business moved at all since yesterday. */
  today: PeriodCounts;
  last7Days: PeriodCounts;
}

export interface PeriodCounts {
  ordered: number;
  delivered: number;
  failed: number;
  accounts: number;
}

// The owner's view of the whole platform: how many accounts exist, how many
// are funded, and how much work has actually been delivered. Feeds the daily
// summary and any "how are we doing" question in the bot.
export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  const [{ count: accountsWithOrderNumber }, { data: registered }, { data: wallets }, { data: tasks }] =
    await Promise.all([
      supabaseAdmin.from('client_accounts').select('user_id', { count: 'exact', head: true }),
      // Signups live in auth.users, which PostgREST does not expose -- see
      // migration 0020. Counting client_accounts instead produced "0 total, 2
      // funded", because a row there is only created on an account's FIRST
      // order, not at signup.
      supabaseAdmin.rpc('count_registered_users'),
      supabaseAdmin.from('wallets').select('user_id, balance_usd'),
      supabaseAdmin.from('tasks').select('status, sku, type, payload, user_id, created_at')
    ]);

  const funded = (wallets ?? []).filter((w: any) => Number(w.balance_usd) > 0);
  const balanceHeldUsd = funded.reduce((sum: number, w: any) => sum + Number(w.balance_usd), 0);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Midnight UTC, not "24 hours ago" -- "today" should mean the calendar day,
  // so the number resets overnight instead of sliding.
  const startOfToday = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString();
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const activeUsers = new Set<string>();
  const byProduct = new Map<number, number>();
  const todayUsers = new Set<string>();
  const weekUsers = new Set<string>();
  let tasksDelivered = 0;
  let tasksInFlight = 0;
  let tasksFailed = 0;
  let tasksNeedingInfo = 0;

  const today: PeriodCounts = { ordered: 0, delivered: 0, failed: 0, accounts: 0 };
  const last7Days: PeriodCounts = { ordered: 0, delivered: 0, failed: 0, accounts: 0 };

  for (const task of (tasks ?? []) as any[]) {
    if (task.user_id && task.created_at >= since) activeUsers.add(task.user_id);
    if (task.status === 'delivered') tasksDelivered++;
    else if (task.status === 'failed') tasksFailed++;
    else if (task.status === 'needs_info') tasksNeedingInfo++;
    else tasksInFlight++;

    for (const [start, bucket, users] of [
      [startOfToday, today, todayUsers],
      [startOfWeek, last7Days, weekUsers]
    ] as [string, PeriodCounts, Set<string>][]) {
      if (task.created_at < start) continue;
      bucket.ordered++;
      if (task.status === 'delivered') bucket.delivered++;
      if (task.status === 'failed') bucket.failed++;
      if (task.user_id) users.add(task.user_id);
    }

    const item = (task.sku != null ? getSku(task.sku) : null) ?? resolveSku(task.type, task.payload ?? {});
    if (item) byProduct.set(item.sku, (byProduct.get(item.sku) ?? 0) + 1);
  }

  today.accounts = todayUsers.size;
  last7Days.accounts = weekUsers.size;

  const topProducts = [...byProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, count]) => ({ sku, name: getSku(sku)?.name ?? String(sku), count }));

  return {
    registeredUsers: Number(registered ?? 0),
    accountsWithOrderNumber: accountsWithOrderNumber ?? 0,
    accountsWithBalance: funded.length,
    accountsActive30d: activeUsers.size,
    balanceHeldUsd,
    tasksTotal: (tasks ?? []).length,
    tasksDelivered,
    tasksInFlight,
    tasksFailed,
    tasksNeedingInfo,
    topProducts,
    today,
    last7Days
  };
}

// What a task's status actually is, and -- when it is stuck -- the real reason
// recorded against it.
//
// This exists because of a live failure: asked "what information does it
// need?" about a task sitting in needs_info, the bot answered about a
// completely different product, describing a letterhead when the task was a
// video. Nothing was wrong with the model; it simply had no way to look the
// answer up, so it answered from the conversation, which is exactly what a
// conversation is bad at. The reason was sitting in task_events the whole time.
export interface TaskStatusReport {
  publicId: string;
  product: string;
  type: string;
  status: string;
  createdAt: string;
  /** The worker's own words for why it stopped, when it stopped. */
  reason: string | null;
  revisionsUsed: number;
  revisionsAllowed: number;
  fileUrls: string[];
}

export async function getTaskStatus(publicId: string): Promise<TaskStatusReport | null> {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('id, public_id, type, sku, status, payload, created_at, revisions_used, revisions_allowed')
    .eq('public_id', publicId)
    .maybeSingle();

  if (error || !task) return null;

  const [{ data: events }, { data: files }] = await Promise.all([
    supabaseAdmin
      .from('task_events')
      .select('event_type, detail, created_at')
      .eq('task_id', task.id)
      .in('event_type', ['needs_info', 'failed'])
      .order('created_at', { ascending: false })
      .limit(1),
    supabaseAdmin.from('task_files').select('url').eq('task_id', task.id).order('version', { ascending: false })
  ]);

  const product = (task.sku != null ? getSku(task.sku) : null) ?? resolveSku(task.type, task.payload ?? {});
  const latest = (events ?? [])[0] as any;

  return {
    publicId: task.public_id,
    product: product?.name ?? task.type,
    type: task.type,
    status: task.status,
    createdAt: task.created_at,
    reason: latest?.detail?.reason ?? null,
    revisionsUsed: task.revisions_used ?? 0,
    revisionsAllowed: task.revisions_allowed ?? product?.revisions ?? 0,
    fileUrls: ((files ?? []) as any[]).map((f) => f.url)
  };
}

// The owner's live task list, for the bot's prompt. Same principle as
// accountBriefForPrompt on the client side: the front line answers from this,
// not from what it remembers saying.
export async function ownerTaskBriefForPrompt(): Promise<string> {
  const tasks = await listOwnerTasks(15);
  if (tasks.length === 0) return 'TASKS (live): none yet.';

  const line = (t: (typeof tasks)[number]) => `- ${t.publicId} — ${t.product} — ${t.status}`;
  const mine = tasks.filter((t) => t.owner);
  const clients = tasks.filter((t) => !t.owner);

  // Listed apart because they are different work with different numbering:
  // AC-OWNER-#### is the owner's own, AC-1007-03 is a client's order. Both are
  // visible -- the owner runs the platform and is asked about client tasks
  // constantly -- but never presented as one undifferentiated pile.
  const sections = ['TASKS (live data -- trust this over anything said earlier in this chat):'];
  if (mine.length > 0) sections.push('', "The owner's own tasks:", ...mine.map(line));
  if (clients.length > 0) sections.push('', 'Client orders:', ...clients.map(line));

  return (
    `${sections.join('\n')}\n\n` +
    `When a message refers to a task vaguely ("that letterhead", "the video one", "the last one"), match it ` +
    `against these lists. An AC-OWNER-#### reference is the owner's own work; AC-1007-03 style is a client's ` +
    `order. NEVER state why a task needs information, what it is waiting on, or what it produced from memory ` +
    `-- that is recorded per task and must be looked up, so use intent "status" with the task's reference and ` +
    `the real reason will be fetched and reported.`
  );
}

