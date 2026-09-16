// Recognising which order somebody means, from the words they actually used.
//
// Clients and the owner do not quote reference numbers. They say "can you
// redo the header on that letter thing" or "change the second one". Turning
// that into exactly one order is the single most important thing the
// conversational front line does, because getting it wrong doesn't produce an
// error -- it produces a confident revision of the wrong deliverable.
//
// This file is deliberately pure: it takes an order book and a piece of text
// and returns a match. No database, no account scoping. Forge passes a
// client's book and the Telegram bot passes the owner's, and both recognise a
// reference by exactly the same rules -- which is the point, since "the bot
// understood it but Forge didn't" is its own class of bug.
//
// The governing rule is that ambiguity is reported, never resolved. When the
// book doesn't decide between two orders, this returns no match and hands back
// the candidates, so the front line asks a one-line question instead of
// guessing. Asking is cheap; revising the wrong file costs the client's trust.

import { CATALOG } from './catalog.ts';
import type { OrderSummary } from './orders.ts';

export interface OrderMatch {
  /** The one order the text refers to, when it refers to exactly one. */
  order: OrderSummary | null;
  /** How it was recognised -- useful in logs when a match turns out wrong. */
  how: 'reference' | 'order_number' | 'product' | 'only_order' | 'most_recent' | 'none';
  /** Populated when several orders fit; the front line must ask, not guess. */
  candidates: OrderSummary[];
}

const NONE: OrderMatch = { order: null, how: 'none', candidates: [] };

// Matches both the account-scoped form (AC-1007-03) and the older global one
// (AC-CLICK-0007), so references issued before per-account numbering existed
// keep working in conversation.
export const REFERENCE_PATTERN = /\b(?:AC-\d{4}-\d{2,}|AC-CLICK-\d{4}(?:-[0-9a-f]{4})?)\b/i;

export function findReference(text: string): string | null {
  return text.match(REFERENCE_PATTERN)?.[0]?.toUpperCase() ?? null;
}

// Words meaning "the one we were just talking about" rather than naming a
// product. Kept deliberately small: a vague pronoun resolves only when there
// is exactly one plausible order, never as a general fallback.
const LAST_ORDER_HINT = /\b(last|latest|recent|previous|that one|the one)\b/i;

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10
};

const ORDINAL_PATTERN = new RegExp(`\\b(${Object.keys(ORDINALS).join('|')})\\b`, 'i');
const ORDER_NUMBER_PATTERN = /\b(?:order|task|number|no\.?|#)\s*(\d{1,3})\b/i;

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

// Which catalog products the words could be naming, matched against each
// product's name and aliases.
//
// Only the most specific matches survive: "my business plan" matches the alias
// "business plan" and would also match anything aliased merely "plan", so a
// product matched only by a shorter phrase is dropped. Without that, naming
// one product drags in every loosely-related one and turns a clean match into
// a needless "which did you mean?".
export function productsNamedIn(text: string): Set<number> {
  const haystack = normalize(text);
  const bestLengthBySku = new Map<number, number>();

  for (const item of CATALOG) {
    const phrases = [item.name.toLowerCase().split('—')[0], ...item.aliases]
      .map((phrase) => normalize(phrase).trim())
      .filter((phrase) => phrase.length >= 3);

    for (const phrase of phrases) {
      if (!haystack.includes(` ${phrase} `)) continue;
      bestLengthBySku.set(item.sku, Math.max(bestLengthBySku.get(item.sku) ?? 0, phrase.length));
    }
  }

  if (bestLengthBySku.size === 0) return new Set();
  const longest = Math.max(...bestLengthBySku.values());
  return new Set([...bestLengthBySku.entries()].filter(([, length]) => length === longest).map(([sku]) => sku));
}

// Words that name a whole SERVICE rather than one product. "video" cannot be
// a product alias because three different video products exist, so a bare
// "that video" matched nothing at all and fell through to offering the last
// five tasks -- none of which were videos. A service word narrows to every
// task in that service, which is usually enough to land on exactly one.
const SERVICE_WORDS: Record<string, string[]> = {
  video: ['video', 'clip', 'reel'],
  website: ['website', 'site', 'web page', 'webpage', 'landing page'],
  image: ['image', 'picture', 'photo', 'graphic', 'visual'],
  social: ['social', 'social media', 'post', 'posts'],
  documents: ['document', 'documents', 'paperwork'],
  'brand-kit': ['brand kit', 'branding'],
  pdf: ['pdf'],
  'business-report': ['report', 'audit']
};

export function servicesNamedIn(text: string): Set<string> {
  const haystack = normalize(text);
  const hits = new Set<string>();
  for (const [service, words] of Object.entries(SERVICE_WORDS)) {
    if (words.some((word) => haystack.includes(` ${normalize(word).trim()} `))) hits.add(service);
  }
  return hits;
}

// Narrowing to one of a set, with the same rule used everywhere else: exactly
// one is an answer, several is a question unless they said "the last one".
function narrow(matches: OrderSummary[], text: string, how: OrderMatch['how']): OrderMatch | null {
  if (matches.length === 1) return { order: matches[0], how, candidates: [] };
  if (matches.length > 1) {
    if (LAST_ORDER_HINT.test(text)) return { order: matches[0], how: 'most_recent', candidates: matches };
    return { order: null, how: 'none', candidates: matches };
  }
  return null;
}

// Ordered most-certain-first: a quoted reference beats an order number, which
// beats a named product, which beats a named service, which beats "the last
// one".
export function matchOrder(orders: OrderSummary[], text: string): OrderMatch {
  if (orders.length === 0) return NONE;

  // 1. They quoted a reference. Nothing to infer.
  const reference = findReference(text);
  if (reference) {
    const exact = orders.find((order) => order.publicId.toUpperCase() === reference);
    if (exact) return { order: exact, how: 'reference', candidates: [] };
  }

  // 2. They named an order number -- "order 3", "#3", "my second one".
  const numeric = text.match(ORDER_NUMBER_PATTERN);
  const ordinalWord = text.match(ORDINAL_PATTERN);
  const orderNo = numeric ? Number(numeric[1]) : ordinalWord ? ORDINALS[ordinalWord[1].toLowerCase()] : null;
  if (orderNo !== null) {
    const byNumber = orders.find((order) => order.orderNo === orderNo);
    if (byNumber) return { order: byNumber, how: 'order_number', candidates: [] };
  }

  // 3. They named a product. One match is an answer; several is a question.
  //    ("The last logo" is still decidable; a bare "my logo" with three logos
  //    is not.)
  const named = productsNamedIn(text);
  if (named.size > 0) {
    const decided = narrow(orders.filter((order) => order.sku !== null && named.has(order.sku)), text, 'product');
    if (decided) return decided;
    // Named a product they have never ordered -- fall through to the service
    // check rather than resolving to something unrelated, so "revise my logo"
    // with no logo on the book never quietly revises their website.
  }

  // 4. They named a service rather than a product -- "that video", "the site".
  //    Matched on the task's service, not its sku, so tasks created before
  //    product numbers existed still resolve.
  const services = servicesNamedIn(text);
  if (services.size > 0) {
    const decided = narrow(orders.filter((order) => services.has(order.service)), text, 'product');
    if (decided) return decided;
  }

  // Nothing they named is on the book at all.
  if (named.size > 0 || services.size > 0) return { order: null, how: 'none', candidates: [] };

  // 5. Nothing named, but there is only one thing it could be.
  if (orders.length === 1) return { order: orders[0], how: 'only_order', candidates: [] };

  // 6. "The last one" -- only on an explicit hint, never as a default.
  if (LAST_ORDER_HINT.test(text)) return { order: orders[0], how: 'most_recent', candidates: orders.slice(0, 5) };

  return { order: null, how: 'none', candidates: orders.slice(0, 5) };
}

// One line per candidate, for the "which of these did you mean?" reply.
export function describeCandidates(candidates: OrderSummary[]): string {
  return candidates.map((order) => `${order.publicId} — ${order.product} (${order.status})`).join('\n');
}
