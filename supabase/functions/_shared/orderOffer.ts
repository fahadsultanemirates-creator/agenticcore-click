// What the bot says between "I think you want X" and the client saying yes.
//
// Pure, because this is where a client either understands what they are
// about to be charged or does not, and because the arithmetic -- what a
// thing costs, what is in the wallet, what is missing, which top-up
// covers it -- is exactly the kind of thing that is obviously right until
// somebody orders two things with $7.50 in their wallet.
import { CATALOG, type CatalogItem } from './catalog.ts';

/**
 * The wallet packages, smallest first. Mirrors src/data/packages.ts,
 * kept in sync by hand since the frontend is a static SPA with no shared
 * build step with these functions.
 *
 * The discounts are here, not only on the website, because the bot sells
 * these too: "$100" on its own is a number, not an offer, and a client
 * choosing in a chat should not be deciding on less information than one
 * choosing on the site.
 *
 * It lives in this module rather than usdtInvoice.ts so it can be tested
 * under Node -- usdtInvoice reaches the chain and the database, and this
 * is just a price list.
 */
export interface WalletPackage {
  tier: string;
  amountUsd: number;
  /** Standing discount on every order, for good. */
  routineDiscount: number;
  /** One-off, on the first order after the first top-up. */
  firstOrderDiscount: number;
}

export const WALLET_PACKAGES: readonly WalletPackage[] = [
  { tier: 'wallet-10', amountUsd: 10, routineDiscount: 0, firstOrderDiscount: 15 },
  { tier: 'wallet-30', amountUsd: 30, routineDiscount: 10, firstOrderDiscount: 30 },
  { tier: 'wallet-100', amountUsd: 100, routineDiscount: 20, firstOrderDiscount: 50 },
  { tier: 'wallet-200', amountUsd: 200, routineDiscount: 30, firstOrderDiscount: 65 }
] as const;

/** Just the amounts, for the places that only need those. */
export const TOPUP_TIERS = WALLET_PACKAGES.map((p) => p.amountUsd);

export interface Offer {
  /** What to send the client. */
  text: string;
  /** Can they pay for it right now? */
  affordable: boolean;
  /** 0 when affordable, otherwise what is missing, to the cent. */
  shortfallUsd: number;
  /** The smallest tier that covers the shortfall, or the largest if none do. */
  suggestedTopUpUsd: number;
}

/** Money as the client sees it everywhere else: two decimals, no surprises. */
export function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * The smallest top-up that covers what is missing.
 *
 * Rounded to the cent before comparing: a shortfall of 10.000000000000002
 * — which is what 20 - 9.999999999999998 gives you — would otherwise skip
 * the $10 tier and push the client to $30 for a hundredth of a cent.
 */
export function suggestTopUp(shortfallUsd: number): number {
  const needed = Math.round(shortfallUsd * 100) / 100;
  return TOPUP_TIERS.find((tier) => tier >= needed) ?? TOPUP_TIERS[TOPUP_TIERS.length - 1];
}

export function describeOffer(opts: {
  productName: string;
  /** What they will actually be charged, after any discount. */
  priceUsd: number;
  balanceUsd: number;
  brief: string;
  revisions: number;
  /** One line about a discount, when one applies. See discount.ts. */
  discountNote?: string | null;
}): Offer {
  const shortfallRaw = opts.priceUsd - opts.balanceUsd;
  const shortfallUsd = shortfallRaw > 0 ? Math.round(shortfallRaw * 100) / 100 : 0;
  const affordable = shortfallUsd === 0;

  const lines = [
    opts.productName,
    usd(opts.priceUsd),
    ...(opts.discountNote ? [opts.discountNote] : []),
    '',
    `Brief: ${opts.brief}`,
    '',
    opts.revisions > 0
      ? `Includes ${opts.revisions} revision${opts.revisions === 1 ? '' : 's'}.`
      : 'No revisions — this product comes back as options to choose from.',
    `Wallet: ${usd(opts.balanceUsd)}`
  ];

  if (affordable) {
    lines.push('', 'Reply YES to order it, or tell me what to change.');
  } else {
    const suggested = suggestTopUp(shortfallUsd);
    lines.push(
      '',
      `You are ${usd(shortfallUsd)} short.`,
      `Send /topup ${suggested} and I will give you an address to pay, then reply YES.`
    );
  }

  return { text: lines.join('\n'), affordable, shortfallUsd, suggestedTopUpUsd: suggestTopUp(shortfallUsd) };
}

/**
 * The catalogue as a client reads it: grouped, priced, no SKU numbers.
 *
 * The owner's catalogMenu is a routing table for a prompt -- SKU numbers,
 * service keys, aliases, branding. None of that means anything to someone
 * deciding whether to buy a logo, and the SKU numbers in particular invite
 * "order 30", which is not an interface anybody asked for.
 */
export function clientCatalogue(priceOf: (item: CatalogItem) => number | null): string {
  const groups = new Map<string, string[]>();

  for (const item of CATALOG) {
    if (item.ownerOnly) continue;
    const price = priceOf(item);
    if (price === null) continue;
    const line = `  ${item.name} — ${usd(price)}`;
    const group = GROUP_NAMES[item.service] ?? item.service;
    groups.set(group, [...(groups.get(group) ?? []), line]);
  }

  const sections = [...groups.entries()].map(([group, lines]) => [group, ...lines].join('\n'));

  // Blocks joined by a blank line, which means no block may start or end
  // with one of its own -- a stray '' here renders as a two-line gap.
  return [
    'What we make:',
    ...sections,
    'Tell me what you want in your own words — "a logo for my bakery", ' +
      '"a 5-page website for a plumbing company" — and I will quote it.'
  ].join('\n\n');
}

const GROUP_NAMES: Record<string, string> = {
  website: 'Websites',
  pdf: 'Print & design',
  image: 'Images',
  video: 'Video',
  social: 'Social media',
  documents: 'Business documents',
  'brand-kit': 'Brand & marketing kit'
};
