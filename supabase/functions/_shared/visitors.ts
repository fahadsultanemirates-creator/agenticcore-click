// Counting the people who come to the site, without following them.
//
// No cookie, no device id, no stored IP. A visit is attributed to a hash
// of (salt + ip + user agent) where the salt changes every day, so the
// same person is one visitor within a day and an unrelated one tomorrow.
// That is enough to answer "how many people came today" and deliberately
// not enough to answer "did this person come back on Friday" -- which is
// also why it needs no consent banner.
//
// Everything in this file is pure. The counting rules are the whole
// product here: a bot list that misses crawlers inflates every number
// the owner will act on, and a number nobody can trust is worse than no
// number at all.

/**
 * Tokens that appear in a crawler's user agent and essentially never in
 * a person's. Matched case-insensitively against the whole string.
 *
 * Erring toward over-matching on purpose. Missing a crawler quietly
 * doubles a quiet day's figures; wrongly dropping one real visitor is a
 * rounding error nobody acts on.
 */
const BOT_TOKENS = [
  'bot', 'crawl', 'spider', 'slurp', 'scrape', 'curl', 'wget', 'python-requests',
  'headless', 'phantomjs', 'puppeteer', 'playwright', 'lighthouse', 'pingdom',
  'uptime', 'monitor', 'preview', 'fetcher', 'feedfetcher', 'archiver',
  'facebookexternalhit', 'whatsapp', 'telegrambot', 'discordbot', 'slackbot',
  'embedly', 'quora link preview', 'vkshare', 'skypeuripreview', 'google-read-aloud',
  'applebot', 'yandex', 'baiduspider', 'duckduckbot', 'semrush', 'ahrefs', 'mj12',
  'dotbot', 'petalbot', 'bytespider', 'gptbot', 'claudebot', 'ccbot', 'perplexity'
] as const;

/** True when this user agent is a crawler, a preview fetcher or a script. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim() === '') return true; // no UA at all is never a browser
  const ua = userAgent.toLowerCase();
  return BOT_TOKENS.some((token) => ua.includes(token));
}

/** How long a stored path may be. Anything longer is a crafted URL, not a page. */
export const MAX_PATH_LENGTH = 120;

/**
 * The page, without the query string.
 *
 * Query strings carry invite codes, email click ids and the project id
 * the service pages use. Keeping them would make every visit look like a
 * distinct page and would store identifiers we have no reason to hold.
 */
export function normalisePath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/';
  const withoutQuery = raw.split(/[?#]/)[0].trim();
  if (withoutQuery === '' || !withoutQuery.startsWith('/')) return '/';
  // A trailing slash on a deeper path is the same page: /projects/ is /projects.
  const trimmed = withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery;
  return (trimmed === '' ? '/' : trimmed).slice(0, MAX_PATH_LENGTH);
}

/**
 * Where they came from, as a bare host.
 *
 * Our own pages are "direct": a client moving from the landing page to
 * the dashboard did not arrive from anywhere, and counting that as a
 * referral would make the site its own biggest traffic source.
 */
export function referrerHost(referrer: string | null | undefined, selfHost: string): string {
  if (!referrer || referrer.trim() === '') return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  const bare = host.replace(/^www\./, '');
  const self = selfHost.toLowerCase().replace(/^www\./, '');
  return bare === self || bare === '' ? 'direct' : bare.slice(0, 80);
}

// ---------------------------------------------------------------------------
// The message

export interface VisitorWindow {
  visitors: number;
  views: number;
}

export interface VisitorStats {
  today: VisitorWindow;
  last7Days: VisitorWindow;
  last30Days: VisitorWindow;
  /** Most-visited pages over the last 7 days, biggest first. */
  topPages: { path: string; views: number }[];
  /** Where the last 7 days came from, biggest first. */
  topReferrers: { host: string; visitors: number }[];
  /** What the last 7 days turned into. */
  signups7d: number;
  orders7d: number;
  /** Crawlers seen today, counted and excluded from every figure above. */
  botsToday: number;
}

function line(label: string, window: VisitorWindow): string {
  return `${label}: ${window.visitors} ${window.visitors === 1 ? 'person' : 'people'} · ${window.views} ${window.views === 1 ? 'view' : 'views'}`;
}

/**
 * The reply to /visitors.
 *
 * The funnel is the point. A visitor count on its own tells you a number
 * went up; "84 came, 3 opened an account, 1 paid" tells you which half
 * of the business to fix, and no third-party analytics tool can say it
 * because none of them knows about the wallet.
 */
export function visitorStatsText(stats: VisitorStats): string {
  const parts: string[] = [
    'VISITORS',
    '',
    line('Today', stats.today),
    line('Last 7 days', stats.last7Days),
    line('Last 30 days', stats.last30Days)
  ];

  if (stats.topPages.length > 0) {
    parts.push('', 'Most visited (7d):');
    for (const page of stats.topPages) parts.push(`  ${page.path} — ${page.views}`);
  }

  if (stats.topReferrers.length > 0) {
    parts.push('', 'Came from (7d):');
    for (const ref of stats.topReferrers) parts.push(`  ${ref.host} — ${ref.visitors}`);
  }

  parts.push(
    '',
    'Last 7 days turned into:',
    `  ${stats.signups7d} account${stats.signups7d === 1 ? '' : 's'}, ${stats.orders7d} paid order${stats.orders7d === 1 ? '' : 's'}`
  );

  if (stats.last7Days.visitors > 0) {
    const rate = (stats.orders7d / stats.last7Days.visitors) * 100;
    parts.push(`  ${rate.toFixed(1)}% of visitors bought something`);
  }

  // Said out loud rather than silently dropped: a day that looks empty is
  // worth telling apart from a day that was all crawlers.
  if (stats.botsToday > 0) {
    parts.push('', `(${stats.botsToday} crawler hit${stats.botsToday === 1 ? '' : 's'} today, not counted above)`);
  }

  if (stats.last30Days.views === 0) {
    parts.push('', 'Nothing recorded yet. Counting starts from the deploy that added it.');
  }

  return parts.join('\n');
}
