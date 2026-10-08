// Run with: node --experimental-strip-types supabase/functions/_shared/visitors.test.ts

import assert from 'node:assert/strict';
import {
  isBotUserAgent,
  MAX_PATH_LENGTH,
  normalisePath,
  referrerHost,
  visitorStatsText,
  type VisitorStats
} from './visitors.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const CHROME_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

test('real browsers are people', () => {
  assert.equal(isBotUserAgent(CHROME_PHONE), false);
  assert.equal(isBotUserAgent(SAFARI_MAC), false);
});

// Missing a crawler quietly doubles a quiet day's figures, which is the
// whole reason this list errs wide.
test('crawlers, previewers and scripts are not', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'facebookexternalhit/1.1',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'HeadlessChrome/120.0',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
    'GPTBot/1.0',
    'Bytespider'
  ]) {
    assert.equal(isBotUserAgent(ua), true, `should be a bot: ${ua}`);
  }
});

// A request with no user agent is a script that did not bother. Counting
// it as a person is the one direction that inflates.
test('no user agent at all is never a person', () => {
  assert.equal(isBotUserAgent(''), true);
  assert.equal(isBotUserAgent(null), true);
  assert.equal(isBotUserAgent(undefined), true);
  assert.equal(isBotUserAgent('   '), true);
});

// Query strings carry invite codes, email click ids and the ?project= the
// service pages use. Keeping them stores identifiers we have no reason to
// hold, and makes one page look like twenty.
test('the query string and hash never reach storage', () => {
  assert.equal(normalisePath('/claim?email=a@b.com&code=AB3F-KM79'), '/claim');
  assert.equal(normalisePath('/dashboard/image?project=uuid-here'), '/dashboard/image');
  assert.equal(normalisePath('/projects#top'), '/projects');
});

test('a trailing slash is the same page, but the root keeps its own', () => {
  assert.equal(normalisePath('/projects/'), '/projects');
  assert.equal(normalisePath('/projects///'), '/projects');
  assert.equal(normalisePath('/'), '/');
});

test('anything that is not a path becomes the root', () => {
  assert.equal(normalisePath(''), '/');
  assert.equal(normalisePath(null), '/');
  assert.equal(normalisePath('javascript:alert(1)'), '/');
  assert.equal(normalisePath('https://evil.test/x'), '/');
});

test('a crafted long path cannot fill the column', () => {
  assert.equal(normalisePath('/' + 'a'.repeat(500)).length, MAX_PATH_LENGTH);
});

// Counting our own pages as referrals would make the site its own
// biggest traffic source.
test('our own pages are direct, not a referral', () => {
  assert.equal(referrerHost('https://agenticcore.click/', 'agenticcore.click'), 'direct');
  assert.equal(referrerHost('https://www.agenticcore.click/projects', 'agenticcore.click'), 'direct');
  assert.equal(referrerHost('', 'agenticcore.click'), 'direct');
  assert.equal(referrerHost(null, 'agenticcore.click'), 'direct');
  assert.equal(referrerHost('not a url', 'agenticcore.click'), 'direct');
});

test('a real referrer keeps its host and loses the www', () => {
  assert.equal(referrerHost('https://www.google.com/search?q=logo', 'agenticcore.click'), 'google.com');
  assert.equal(referrerHost('https://t.me/somechannel', 'agenticcore.click'), 't.me');
});

const STATS: VisitorStats = {
  today: { visitors: 12, views: 18 },
  last7Days: { visitors: 84, views: 131 },
  last30Days: { visitors: 210, views: 402 },
  topPages: [
    { path: '/', views: 70 },
    { path: '/dashboard', views: 22 }
  ],
  topReferrers: [
    { host: 'direct', visitors: 50 },
    { host: 'google.com', visitors: 20 }
  ],
  signups7d: 3,
  orders7d: 1,
  botsToday: 9
};

test('the reply carries every window and the funnel', () => {
  const text = visitorStatsText(STATS);
  assert.match(text, /Today: 12 people · 18 views/);
  assert.match(text, /Last 7 days: 84 people/);
  assert.match(text, /Last 30 days: 210 people/);
  assert.match(text, /3 accounts, 1 paid order/);
  assert.match(text, /1\.2% of visitors bought something/);
  assert.match(text, /google\.com — 20/);
  assert.match(text, /9 crawler hits today, not counted/);
});

test('one of a thing is singular', () => {
  const text = visitorStatsText({
    ...STATS,
    today: { visitors: 1, views: 1 },
    signups7d: 1,
    orders7d: 1,
    botsToday: 1
  });
  assert.match(text, /Today: 1 person · 1 view\b/);
  assert.match(text, /1 account, 1 paid order/);
  assert.match(text, /1 crawler hit today/);
});

// Dividing by a day with no visitors is how a stats command starts
// answering NaN%.
test('an empty week does not divide by zero', () => {
  const text = visitorStatsText({
    today: { visitors: 0, views: 0 },
    last7Days: { visitors: 0, views: 0 },
    last30Days: { visitors: 0, views: 0 },
    topPages: [],
    topReferrers: [],
    signups7d: 0,
    orders7d: 0,
    botsToday: 0
  });
  assert.ok(!text.includes('NaN'), text);
  assert.ok(!text.includes('%'), 'no rate to quote when nobody came');
  assert.match(text, /Nothing recorded yet/);
});

test('a quiet-but-started week says nothing about crawlers it did not see', () => {
  const text = visitorStatsText({ ...STATS, botsToday: 0 });
  assert.ok(!text.includes('crawler'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
