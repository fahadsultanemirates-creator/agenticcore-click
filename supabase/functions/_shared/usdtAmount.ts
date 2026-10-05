// Turning a price into an amount that identifies one invoice, and reading
// what actually arrived on-chain back into a number.
//
// The scheme: one receiving address, and every open invoice gets a slightly
// different amount. A payment of exactly 20.000007 USDT is invoice #7 and
// nothing else. No deposit addresses to derive, no keys to custody, no
// sweeping job -- and the address can be printed on the page and in the bot
// without any of it being secret.
//
// The cost is that amounts must be matched EXACTLY. There is no tolerance
// here on purpose: a tolerance wide enough to absorb a rounding error is
// also wide enough to make two invoices ambiguous, and crediting the wrong
// client's wallet is worse than holding a payment for a human to look at.
// USDT transfers do not deduct a fee from the amount -- gas is paid in BNB
// -- so an exact match is the normal case, not an optimistic one.
//
// Everything is bigint. A naive `usd * 10 ** 18` is wrong before it is
// slow: 20.000001 * 1e18 is far past Number.MAX_SAFE_INTEGER, so the
// multiply silently loses the low digits that the whole scheme depends on.

/** The gap between consecutive invoice amounts: 0.000001 USDT. */
export const NONCE_STEP_DECIMALS = 6;

/** Digits the nonce occupies: the four places after the two cents places. */
const NONCE_DIGITS = NONCE_STEP_DECIMALS - 2;

/**
 * The largest nonce that fits.
 *
 * Four digits, because the amount is two decimal places of price followed
 * by the nonce and the whole thing has to stay at NONCE_STEP_DECIMALS. It
 * was six, which padded to nothing and quietly produced an eight-decimal
 * amount for any nonce above 9999 -- an amount no wallet would round-trip
 * and no payment would ever match.
 *
 * Nonces are handed out smallest-first, so an amount reads as 20.000003.
 * The ceiling only matters with ten thousand invoices open at one price,
 * which would be a different problem.
 */
export const MAX_NONCE = 10 ** NONCE_DIGITS - 1;

/**
 * Parses a decimal amount into on-chain units.
 *
 * Deliberately string-based. The token's own decimals are read from the
 * contract rather than assumed, because USDT is 6 decimals on Ethereum and
 * Tron and 18 on BNB Smart Chain, and being wrong by 10^12 either gives the
 * work away or rejects every real payment.
 */
export function toUnits(amount: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Not a positive decimal amount: ${JSON.stringify(amount)}`);
  }
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > decimals) {
    // Truncating here would quietly change the amount a client was told to
    // send, which is the one number the match depends on.
    throw new Error(`${amount} has more than ${decimals} decimal places`);
  }
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

/** The inverse, with trailing zeros trimmed but at least two places kept. */
export function fromUnits(units: bigint, decimals: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  let fraction = decimals === 0 ? '' : digits.slice(digits.length - decimals);
  fraction = fraction.replace(/0+$/, '').padEnd(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * The amount this invoice must be paid with, exactly.
 *
 * Base price plus the nonce in the sixth decimal place: $20 with nonce 7 is
 * 20.000007. The surcharge is at most a hundredth of a cent, so nobody is
 * meaningfully overpaying to be identifiable.
 */
export function invoiceAmount(baseUsd: number, nonce: number): string {
  if (!Number.isFinite(baseUsd) || baseUsd <= 0) throw new Error(`Invalid base price: ${baseUsd}`);
  if (!Number.isInteger(nonce) || nonce < 1 || nonce > MAX_NONCE) {
    throw new Error(`Nonce out of range: ${nonce}`);
  }

  // BUG 2 was here: rounding a price that is not a whole number of cents.
  // 1.005 * 100 is 100.49999999999999 in binary floating point, so it
  // rounded DOWN to 1.00 and the client was quietly billed a cent less.
  // Every real price is whole cents, so a price that is not is a fault
  // upstream and worth saying so rather than absorbing.
  const cents = baseUsd * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-9) {
    throw new Error(`Price ${baseUsd} is not a whole number of cents`);
  }
  const whole = Math.round(cents);
  const base = `${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`;
  return `${base}${String(nonce).padStart(NONCE_DIGITS, '0')}`;
}

/**
 * The smallest nonce not already in use for this base price.
 *
 * Two open invoices sharing an amount would make a payment unattributable,
 * so allocation is a search rather than a counter: counters reuse numbers
 * after a delete, and the reuse is invisible until two clients pay.
 */
export function allocateNonce(takenNonces: Iterable<number>): number {
  const taken = new Set(takenNonces);
  for (let nonce = 1; nonce <= MAX_NONCE; nonce++) {
    if (!taken.has(nonce)) return nonce;
  }
  throw new Error('No free invoice nonce — too many open invoices at this price');
}

/** A BEP-20 Transfer, as the chain reports it. */
export interface Transfer {
  txHash: string;
  to: string;
  valueRaw: string;
  confirmations: number;
}

export interface MatchOptions {
  /** The amount the invoice must be paid with, e.g. "20.000007". */
  expected: string;
  /** The token's own decimals, read from the contract. */
  decimals: number;
  /** Our receiving address. */
  receivingAddress: string;
  /** Blocks to wait before crediting. BNB blocks are ~3s. */
  minConfirmations: number;
  /** Transaction hashes already credited, so nothing is credited twice. */
  alreadyCredited: Iterable<string>;
}

export type MatchResult =
  | { status: 'paid'; txHash: string }
  | { status: 'confirming'; txHash: string; confirmations: number }
  | { status: 'wrong_amount'; txHash: string; received: string }
  | { status: 'none' };

/** Addresses are compared case-insensitively: EIP-55 is a checksum, not an identity. */
function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Decides what an invoice's transfers mean.
 *
 * Ordered by how much a caller can rely on the answer: a confirmed exact
 * payment first, then one still confirming, then money that arrived for the
 * wrong amount -- which is reported rather than credited, because the one
 * thing identifying the invoice is the amount.
 */
export function matchPayment(transfers: Transfer[], opts: MatchOptions): MatchResult {
  const credited = new Set([...opts.alreadyCredited].map((h) => h.toLowerCase()));
  const expectedUnits = toUnits(opts.expected, opts.decimals);

  const mine = transfers.filter(
    (t) => sameAddress(t.to, opts.receivingAddress) && !credited.has(t.txHash.toLowerCase())
  );

  const exact = mine.filter((t) => {
    try {
      return BigInt(t.valueRaw) === expectedUnits;
    } catch {
      // A value the chain reports in a shape we cannot parse is not a match.
      // Treating it as one would credit an unknown amount.
      return false;
    }
  });

  const confirmed = exact.find((t) => t.confirmations >= opts.minConfirmations);
  if (confirmed) return { status: 'paid', txHash: confirmed.txHash };

  if (exact.length > 0) {
    // The furthest along, so the caller reports progress rather than
    // flickering between two pending transfers.
    const best = exact.reduce((a, b) => (a.confirmations >= b.confirmations ? a : b));
    return { status: 'confirming', txHash: best.txHash, confirmations: best.confirmations };
  }

  const wrong = mine.find((t) => {
    try {
      return BigInt(t.valueRaw) > 0n;
    } catch {
      return false;
    }
  });
  if (wrong) {
    return { status: 'wrong_amount', txHash: wrong.txHash, received: fromUnits(BigInt(wrong.valueRaw), opts.decimals) };
  }

  return { status: 'none' };
}
