// The discount a wallet tier buys, finally applied.
//
// These percentages have been on the website's package cards since the
// start, and nothing anywhere ever applied them: calculatePriceUsd
// returned the list price and the wallet was debited the list price. The
// wallets table even carries a comment saying the calculation "happens in
// dispatch code, not here" -- it did not happen in dispatch code either.
//
// That is worse than a missing feature. A client topping up $100 for
// "20% off every order" and then being charged full price has been told
// something untrue by the product.
//
// Pure, because this decides what somebody is charged. Every rounding
// rule and every precedence question in here is a real amount of a real
// person's money, and none of it needs a database to check.
import { WALLET_PACKAGES } from './orderOffer.ts';

export type DiscountReason = 'first-order' | 'tier' | 'none';

export interface DiscountContext {
  /** Which package last funded the wallet. Null if it was never topped up. */
  tier: string | null;
  /** True when this is the account's very first order. */
  isFirstOrder: boolean;
}

export interface PricedOrder {
  /** What the product costs before anything is taken off. */
  listUsd: number;
  /** The percentage applied, 0 when none was. */
  discountPct: number;
  /** What the wallet is actually debited. */
  chargeUsd: number;
  /** Money saved, for saying so out loud. */
  savedUsd: number;
  reason: DiscountReason;
}

/**
 * Money, to the cent.
 *
 * $3 at 10% off is 2.7000000000000002 in binary floating point. Charging
 * that is not a rounding error, it is a number no currency can express,
 * and it will eventually be the difference between a balance reading
 * $0.00 and $0.0000000001 -- which is not zero, and so not "empty".
 */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Which discount applies, and how much.
 *
 * The two never stack. The first-order discount is the larger of the two
 * at every tier and is a one-off; the tier discount is the standing one.
 * Taking both on a first order would mean 15% + 0% at the $10 tier but
 * 65% + 30% at $200 -- a 95% discount nobody intended and the cards do
 * not describe.
 */
export function applyDiscount(listUsd: number, context: DiscountContext): PricedOrder {
  const pkg = context.tier ? WALLET_PACKAGES.find((p) => p.tier === context.tier) : undefined;

  const none = (): PricedOrder => ({
    listUsd: toCents(listUsd),
    discountPct: 0,
    chargeUsd: toCents(listUsd),
    savedUsd: 0,
    reason: 'none'
  });

  if (!pkg || listUsd <= 0) return none();

  const pct = context.isFirstOrder ? pkg.firstOrderDiscount : pkg.routineDiscount;
  if (pct <= 0) return none();

  const chargeUsd = toCents(listUsd * (1 - pct / 100));

  return {
    listUsd: toCents(listUsd),
    discountPct: pct,
    chargeUsd,
    savedUsd: toCents(toCents(listUsd) - chargeUsd),
    reason: context.isFirstOrder ? 'first-order' : 'tier'
  };
}

/** One line a client can read, or null when there is nothing to say. */
export function discountLine(priced: PricedOrder): string | null {
  if (priced.discountPct === 0) return null;
  const was = `$${priced.listUsd.toFixed(2)}`;
  const now = `$${priced.chargeUsd.toFixed(2)}`;
  return priced.reason === 'first-order'
    ? `${priced.discountPct}% off your first order — ${was} becomes ${now}.`
    : `${priced.discountPct}% off from your wallet tier — ${was} becomes ${now}.`;
}
