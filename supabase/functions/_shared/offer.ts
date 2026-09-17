// Does this brief actually contain an offer?
//
// A brochure exists to sell something. One came back polished, on-brand, and
// with no prices or packages anywhere in it -- the thing a brochure is
// primarily for. Nothing in the system had ever said a brochure needs an
// offer, so nothing noticed it was missing.
//
// An offer can come from two places: the brief, or the client's own site --
// most businesses put their packages on their landing page, and the brand
// profile now reads them. Only when BOTH are empty does the task stop and
// ask, rather than shipping a brochure that quietly omits its own purpose
// or, worse, inventing numbers a client would have to honour.
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

/** Just the payload. Kept separate so the site's own offer can be checked too. */
export function briefHasPricing(payload: Record<string, unknown>): boolean {
  // An explicit field always counts, whatever it says.
  if (typeof payload.pricing === 'string' && payload.pricing.trim() !== '') return true;
  if (Array.isArray(payload.packages) && payload.packages.length > 0) return true;

  const text = briefText(payload);
  // A figure alone is enough; so is naming a structure ("three tiers", "from
  // $99"). Words alone without any figure are not -- "our packages are great"
  // is not an offer.
  return CURRENCY.test(text) && OFFER_WORDS.test(text) ? true : CURRENCY.test(text);
}

// The offer as a whole: what the client typed, or what their site already
// publishes. Asking a business for prices it has printed on its own homepage
// is the kind of thing that makes a system feel stupid.
export function hasOffer(
  payload: Record<string, unknown>,
  profile: { packages?: { name: string; price?: string }[] } | null
): boolean {
  if (briefHasPricing(payload)) return true;
  // A package list without any figures is a menu, not an offer.
  return (profile?.packages ?? []).some((item) => !!item.price?.trim());
}
