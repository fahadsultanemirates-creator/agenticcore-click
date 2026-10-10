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
export const HEADLINE_PRICE = "$20";

/** The qualifier, in full, for the footnote under the stats. */
export const CLAIM_FOOTNOTE = "Targets we build against — updated as real volume comes in.";

/** The same qualifier, short enough to sit under the hero headline. */
export const CLAIM_SHORT = "Typical, not guaranteed — most orders land in minutes, some need a reply from you first.";
