// Is the fact actually available, or do we have to ask?
//
// productSpec.ts says which facts each product needs. This file decides
// whether we already hold them, by looking in the two places a fact can come
// from without bothering the client: the brief they wrote, and their own
// website, which the brand profile has already read.
//
// Asking a business for prices printed on its own homepage is the kind of
// thing that makes a system feel stupid, so the site is always checked before
// a question is raised. But the opposite failure is worse: a brochure that
// quietly shipped with no prices in it, because nothing had ever stated that
// a brochure needs an offer. One costs a reply; the other costs the document
// its whole purpose.
//
// Kept structural on purpose -- it takes a plain object shaped like a brand
// profile rather than importing brandProfile.ts, so this logic can be tested
// without any network or database in the room.

import { FIELDS, type FieldKey, type ProductSpec } from './productSpec.ts';
import { hasOffer } from './offer.ts';

export interface BrandFacts {
  url?: string;
  businessName?: string;
  tagline?: string;
  description?: string;
  primaryColor?: string;
  accentColor?: string;
  fontStyle?: string;
  services?: string[];
  packages?: { name: string; price?: string; includes?: string }[];
  logoUrl?: string;
  socials?: Record<string, string>;
  contact?: { email?: string; phone?: string; whatsapp?: string; address?: string };
}

type Resolver = (payload: Record<string, unknown>, profile: BrandFacts | null) => boolean;

function text(payload: Record<string, unknown>, ...keys: string[]): string {
  return keys
    .map((key) => payload[key])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

function filled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

const briefOf = (payload: Record<string, unknown>) => text(payload, 'description', 'brief', 'notes');

const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s)<>"']+|\b[a-z0-9-]+\.(?:com|net|org|io|ae|co|co\.uk|click|agency|app|store|shop)\b/i;

// Only fields that can be REQUIRED by some product need a resolver; the rest
// are optional everywhere, and an optional field is never a reason to stop.
const RESOLVERS: Partial<Record<FieldKey, Resolver>> = {
  // A brief long enough to actually describe something. A three-word order
  // ("make a deck") names a product, not a topic.
  topic: (payload) => briefOf(payload).length >= 12,

  businessName: (payload, profile) => filled(profile?.businessName) || filled(payload.businessName) || filled(payload.company),

  services: (payload, profile) =>
    filled(profile?.services) || filled(payload.services) || filled(profile?.description) || briefOf(payload).length >= 40,

  // The offer rule lives in offer.ts and is shared with the brochure gate: a
  // package list carrying no figures is a menu, not an offer.
  packages: (payload, profile) => hasOffer(payload, profile),

  // Any single route a reader could actually use. A website counts -- it is a
  // way to reach them -- which is why this rarely stops a task that named a site.
  contact: (payload, profile) =>
    filled(profile?.contact?.email) ||
    filled(profile?.contact?.phone) ||
    filled(profile?.contact?.whatsapp) ||
    Object.keys(profile?.socials ?? {}).length > 0 ||
    filled(profile?.url) ||
    filled(payload.email) ||
    filled(payload.phone) ||
    filled(payload.whatsapp) ||
    filled(payload.url) ||
    filled(payload.website),

  colours: (payload, profile) => filled(profile?.primaryColor) || filled(payload.primaryColor) || filled(payload.brandColors),

  // Governing law cannot be inferred from a brief that never mentions where
  // the business operates. An address is accepted as evidence because it
  // names the country; anything less would be us choosing a jurisdiction for
  // somebody's contract, which is not ours to choose.
  jurisdiction: (payload, profile) =>
    filled(payload.jurisdiction) ||
    filled(payload.country) ||
    filled(payload.emirate) ||
    filled(payload.state) ||
    filled(profile?.contact?.address),

  // A QR code's destination must be sourced, never composed. Their own site is
  // a source; a link typed into the brief is a source; a model's guess at what
  // the link probably is, is not -- and it is only discovered to be wrong in
  // front of a customer.
  targetUrl: (payload, profile) =>
    filled(payload.targetUrl) ||
    filled(payload.qrUrl) ||
    filled(payload.link) ||
    filled(payload.url) ||
    filled(profile?.url) ||
    URL_IN_TEXT.test(briefOf(payload)),

  website: (payload, profile) => filled(profile?.url) || filled(payload.url) || filled(payload.website) || URL_IN_TEXT.test(briefOf(payload))
};

/** The required facts this product needs and we do not have. Empty means build it. */
export function missingRequired(
  spec: ProductSpec | null,
  payload: Record<string, unknown>,
  profile: BrandFacts | null
): FieldKey[] {
  if (!spec) return [];
  return spec.must.filter((key) => {
    const resolver = RESOLVERS[key];
    // A required field with no resolver would silently pass forever, which is
    // exactly the class of bug this file exists to end. Treat it as missing so
    // it surfaces the first time the product is ordered.
    return resolver ? !resolver(payload, profile) : true;
  });
}

/**
 * One message asking for everything that is missing at once.
 *
 * All of it in a single question, because asking for prices, then contact
 * details, then a jurisdiction across three round trips is how a client
 * abandons an order that was two minutes from being built.
 */
export function infoRequest(productName: string, missing: FieldKey[]): string {
  const asks = missing.map((key) => `• ${FIELDS[key].ask}`);
  const opening =
    missing.length === 1
      ? `Before I can build your ${productName.toLowerCase()} I need one thing:`
      : `Before I can build your ${productName.toLowerCase()} I need ${missing.length} things:`;

  return (
    `${opening}\n\n${asks.join('\n')}\n\n` +
    `Send them in any format and I'll build it straight away. ` +
    `I won't invent details you would then have to stand behind.`
  );
}
