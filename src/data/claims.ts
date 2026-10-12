/**
 * The headline numbers, and the qualifier that has to travel with them.
 *
 * "20 minutes" and "$20" are the two biggest claims on the site. StatsBand
 * footnoted them correctly -- "*Targets we build against" -- but the hero
 * <h1>, which is the first thing anyone reads and the thing that gets
 * screenshotted into a campaign post, carried no qualifier at all. A
 * visitor could read the promise and never scroll as far as the asterisk.
 *
 * Declared once so the qualifier cannot be attached to one and not the
 * other. claims.test.ts asserts that anywhere stating the turnaround also
 * states that it is a target.
 */
export const HEADLINE_TURNAROUND = "20 minutes";

/**
 * The headline form. The Terms say stated turnarounds are "what we build
 * against, not guarantees", and the hero now says the same thing in the
 * sentence itself rather than only in a note underneath it -- "about" is
 * the one word that makes the headline agree with the contract.
 */
export const HEADLINE_TURNAROUND_APPROX = `about ${HEADLINE_TURNAROUND}`;

/** The same number on the stats band, where space is tight. */
export const STAT_TURNAROUND = `~${HEADLINE_TURNAROUND.replace("minutes", "min")}`;
export const HEADLINE_PRICE = "$20";

/** The qualifier, in full, for the footnote under the stats. */
export const CLAIM_FOOTNOTE = "Targets we build against — updated as real volume comes in.";

/** The same qualifier, short enough to sit under the hero headline. */
export const CLAIM_SHORT = "Typical, not guaranteed — most orders land in minutes, some need a reply from you first.";

/**
 * How paying actually works, said where the prices are.
 *
 * Every price on this site is paid from a wallet balance, not charged per
 * order -- but the headline says "$20", the website card says "from $10",
 * and nothing next to either explained that you top the wallet up first
 * and that $10 is the smallest top-up. A visitor could reasonably read
 * "from $10" as the price of a website and "$20" as a one-off checkout.
 */
export const WALLET_EXPLAINER =
  "You top up a wallet in USDT and services are paid from the balance. The smallest top-up is $10.";

/** The short form, for a card where a full sentence would crowd it out. */
export const WALLET_EXPLAINER_SHORT = "Paid from your wallet balance. Minimum top-up $10.";
