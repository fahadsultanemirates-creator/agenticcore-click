// Reading the visit log back, for the owner's /visitors command.
//
// Separate from visitors.ts, which is pure and tested. This half is the
// database half: it counts rows and hands the shape to the pure
// formatter, so the wording and the arithmetic can be tested without a
// database in the room.
import { supabaseAdmin } from './storage.ts';
import type { VisitorStats, VisitorWindow } from './visitors.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

type Row = { visitor_hash: string; path: string; referrer_host: string };

/**
 * Unique people and raw views since a moment.
 *
 * Counted in JS over the returned rows rather than with count(distinct)
 * because PostgREST cannot express it, and the alternative -- an RPC per
 * window -- is three more migrations for a figure that is a few thousand
 * rows at the volume this site will see for a long time. If it ever gets
 * big, this becomes a materialised daily rollup, not a cleverer query.
 */
async function windowSince(sinceIso: string): Promise<{ window: VisitorWindow; rows: Row[] }> {
  const { data, error } = await supabaseAdmin
    .from('page_views')
    .select('visitor_hash, path, referrer_host')
    .eq('is_bot', false)
    .gte('seen_at', sinceIso)
    .limit(50000);

  if (error) {
    console.error('visitorStats: read failed', error);
    return { window: { visitors: 0, views: 0 }, rows: [] };
  }

  const rows = (data ?? []) as Row[];
  return { window: { visitors: new Set(rows.map((r) => r.visitor_hash)).size, views: rows.length }, rows };
}

function topBy<T extends string>(pairs: T[], limit: number): { key: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of pairs) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export async function readVisitorStats(): Promise<VisitorStats> {
  const now = Date.now();
  const since = (days: number) => new Date(now - days * DAY_MS).toISOString();

  const [today, week, month, bots, signups, orders] = await Promise.all([
    windowSince(since(1)),
    windowSince(since(7)),
    windowSince(since(30)),
    supabaseAdmin
      .from('page_views')
      .select('id', { count: 'exact', head: true })
      .eq('is_bot', true)
      .gte('seen_at', since(1)),
    supabaseAdmin
      .from('client_accounts')
      .select('user_id', { count: 'exact', head: true })
      .gte('created_at', since(7)),
    // Paid orders, not every task: an owner dogfood task has no user_id
    // and would make the funnel read better than the week went.
    supabaseAdmin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .not('user_id', 'is', null)
      .gte('created_at', since(7))
  ]);

  // Unique people per referrer, not raw views: one person who opened
  // five pages came from one place, once.
  const byReferrer = new Map<string, Set<string>>();
  for (const row of week.rows) {
    const seen = byReferrer.get(row.referrer_host) ?? new Set<string>();
    seen.add(row.visitor_hash);
    byReferrer.set(row.referrer_host, seen);
  }

  return {
    today: today.window,
    last7Days: week.window,
    last30Days: month.window,
    topPages: topBy(week.rows.map((r) => r.path), 5).map(({ key, count }) => ({ path: key, views: count })),
    topReferrers: [...byReferrer.entries()]
      .map(([host, people]) => ({ host, visitors: people.size }))
      .sort((a, b) => b.visitors - a.visitors || a.host.localeCompare(b.host))
      .slice(0, 5),
    signups7d: signups.count ?? 0,
    orders7d: orders.count ?? 0,
    botsToday: bots.count ?? 0
  };
}
