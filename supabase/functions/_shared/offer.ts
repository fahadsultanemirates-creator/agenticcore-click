// Does this brief actually contain an offer?
//
// A brochure exists to sell something. One came back polished, on-brand, and
// with no prices or packages anywhere in it -- the thing a brochure is
// primarily for. Nothing in the system had ever said a brochure needs an
// offer, so nothing noticed it was missing.
//
// The brand profile scrapes services, socials and contact details, never
// pricing, so for these products the figures can only come from the brief.
// When they are absent the task stops and asks, rather than shipping a
// brochure that quietly omits its own purpose or, worse, inventing numbers a
// client would have to honour.
//
// Deliberately generous about what counts: the cost of a false positive is a
// brochure built from a thin offer, while a false negative stops a client who
// did supply their prices. Being asked once is the cheaper mistake only when
// it is rare.

/** Currency figures: $49, £1,200, €99.50, 250 AED, Rs 5000, 15,000 PKR. */
const CURRENCY = /(?:[$£€₹]|\b(?:usd|eur|gbp|aed|sar|pkr|inr|rs|dhs?)\b)\s*\d|(?:\d[\d,.]*)\s*(?:[$£€₹]|\b(?:usd|eur|gbp|aed|sar|pkr|inr|k)\b)/i;

/** Wording that names a commercial structure even without a figure attached. */
const OFFER_WORDS =
  /\b(?:packages?|pricing|price list|tiers?|plans?|per month|per year|monthly|yearly|hourly|starter|basic|standard|premium|enterprise|retainer|from \d)\b/i;

function briefText(payload: Record<string, unknown>): string {
  return [payload.description, payload.brief, payload.pricing, payload.packages]
    .map((value) => (typeof value === 'string' ? value : ''))
    .join(' ');
}

export function hasPricingDetail(payload: Record<string, unknown>): boolean {
  // An explicit field always counts, whatever it says.
  if (typeof payload.pricing === 'string' && payload.pricing.trim() !== '') return true;
  if (Array.isArray(payload.packages) && payload.packages.length > 0) return true;

  const text = briefText(payload);
  // A figure alone is enough; so is naming a structure ("three tiers", "from
  // $99"). Words alone without any figure are not -- "our packages are great"
  // is not an offer.
  return CURRENCY.test(text) && OFFER_WORDS.test(text) ? true : CURRENCY.test(text);
}

// What to say when it is missing. Specific enough to answer in one message,
// because "please provide more detail" wastes the client's next reply.
export function pricingRequest(productName: string): string {
  return (
    `A ${productName.toLowerCase()} is there to sell something, so it needs your packages and prices — ` +
    `that is the part a reader is looking for. Send them in any format, for example:\n\n` +
    `Starter $X — what's included\nGrowth $Y — what's included\nCustom — from $Z\n\n` +
    `Reply with your own and I'll build it straight away. I won't guess figures you'd then have to honour.`
  );
}
