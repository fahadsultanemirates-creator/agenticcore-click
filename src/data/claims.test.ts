// Run with: node --experimental-strip-types src/data/claims.test.ts
//
// "20 minutes" is the biggest claim this site makes. StatsBand footnoted it
// properly from the start; the hero <h1> -- the first thing anyone reads and
// the thing that ends up screenshotted into a campaign post -- carried no
// qualifier at all, and a visitor could read the promise without ever
// scrolling to the asterisk a page below.

import assert from "node:assert/strict";
import process from "node:process";
import { readFileSync } from "node:fs";
import {
  CLAIM_FOOTNOTE,
  CLAIM_SHORT,
  HEADLINE_PRICE,
  HEADLINE_TURNAROUND,
  HEADLINE_TURNAROUND_APPROX,
  STAT_TURNAROUND,
  WALLET_EXPLAINER,
  WALLET_EXPLAINER_SHORT,
} from "./claims.ts";

/** Any constant that puts the turnaround number in front of a visitor. */
const TURNAROUND_SYMBOLS = ["HEADLINE_TURNAROUND_APPROX", "STAT_TURNAROUND", "HEADLINE_TURNAROUND"];
const statesTurnaround = (body: string) => TURNAROUND_SYMBOLS.some((sym) => body.includes(sym));

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${(error as Error).message.split("\n")[0]}`);
  }
}

function code(relative: string): string {
  const raw = readFileSync(new URL(relative, import.meta.url), "utf8");
  return (
    raw
      // Comments here explain the unqualified version that used to ship, so
      // a scan of the raw file would match the very thing being checked for.
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ")
      // And import lines, which name every symbol whether or not the
      // component still uses it. Without this, deleting the hero's qualifier
      // left `import { CLAIM_SHORT, ... }` behind and these tests passed
      // anyway -- verified by deleting it, which is how this was found.
      .replace(/^\s*import\s[\s\S]*?;\s*$/gm, " ")
  );
}

const HERO = code("../components/landing/Hero.tsx");
const STATS = code("../components/landing/StatsBand.tsx");

test("the headline values are the shape the copy assumes", () => {
  // These were imported but only ever referenced as string literals in the
  // assertions below, which lint correctly flagged as an unused import --
  // and which meant nothing checked the values themselves.
  assert.match(HEADLINE_TURNAROUND, /^\d+\s*minutes?$/, "turnaround should read like a duration");
  assert.match(HEADLINE_PRICE, /^\$\d/, "price should read like money");
});

test("both qualifiers actually qualify", () => {
  // A qualifier that does not say the number is not a promise is decoration.
  for (const [name, text] of [
    ["CLAIM_FOOTNOTE", CLAIM_FOOTNOTE],
    ["CLAIM_SHORT", CLAIM_SHORT],
  ] as const) {
    assert.match(
      text,
      /target|typical|not guaranteed|estimate/i,
      `${name} does not actually qualify the claim`,
    );
  }
});

test("no component hardcodes the headline numbers", () => {
  // The bug was one copy qualified and another not. Two copies of "20
  // minutes" is how that happens again.
  for (const [name, text] of [
    ["Hero", HERO],
    ["StatsBand", STATS],
  ] as const) {
    assert.ok(
      !/\b20 minutes\b/.test(text),
      `${name} hardcodes "20 minutes" instead of reading claims.ts`,
    );
    assert.ok(!/"\$20"/.test(text), `${name} hardcodes "$20" instead of reading claims.ts`);
  }
});

test("the headline turnaround reads as an approximation, not a promise", () => {
  // The Terms say stated turnarounds are "what we build against, not
  // guarantees". The headline used to read "in 20 minutes" flat, which
  // does not agree with that; it now carries the hedge in the sentence.
  assert.match(HEADLINE_TURNAROUND_APPROX, /^about /);
  assert.ok(HEADLINE_TURNAROUND_APPROX.includes(HEADLINE_TURNAROUND));
  assert.match(STAT_TURNAROUND, /^~/, "the stat should read as approximate");
});

test("the hero states the turnaround and qualifies it in the same breath", () => {
  assert.ok(statesTurnaround(HERO), "the hero no longer states the turnaround");
  assert.ok(
    HERO.includes("CLAIM_SHORT"),
    "the hero states the turnaround with no qualifier — the original bug",
  );
});

test("the stats band still carries its footnote", () => {
  assert.ok(STATS.includes("CLAIM_FOOTNOTE"), "the stats footnote is gone");
  assert.ok(statesTurnaround(STATS));
});

test("anything stating the turnaround also qualifies it", () => {
  // The real invariant, rather than a check on two named files: if a
  // component imports the headline number, it must import a qualifier too.
  for (const [name, text] of [
    ["Hero", HERO],
    ["StatsBand", STATS],
  ] as const) {
    if (!statesTurnaround(text)) continue;
    assert.ok(
      text.includes("CLAIM_SHORT") || text.includes("CLAIM_FOOTNOTE"),
      `${name} states the turnaround without importing a qualifier`,
    );
  }
});

test("the comment stripper is not making these vacuous", () => {
  const raw = readFileSync(
    new URL("../components/landing/Hero.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(raw.includes("screenshotted"), "fixture: the hero comment should mention this");
  assert.ok(!HERO.includes("screenshotted"), "the stripper left comment text in");
  assert.ok(HERO.includes("<h1"), "the stripper removed real markup");
});

test("the stats band no longer claims a measured average", () => {
  // "average turnaround" asserts a statistic nobody computes. "typical"
  // says the same useful thing without claiming a measurement.
  assert.ok(!/average turnaround/i.test(STATS), "the stats band still says 'average'");
  assert.ok(/typical turnaround/i.test(STATS), "the stats band should say 'typical'");
});

test("the wallet is explained where the prices are", () => {
  // "$20" in the headline and "from $10" on the website card are both
  // prices paid out of a wallet balance, and $10 is also the minimum
  // top-up -- which made the two easy to read as the same number.
  for (const text of [WALLET_EXPLAINER, WALLET_EXPLAINER_SHORT]) {
    assert.match(text, /wallet/i, "the explainer should name the wallet");
    assert.match(text, /\$10/, "the explainer should state the minimum top-up");
  }
  assert.match(WALLET_EXPLAINER, /top up|top-up/i);

  const hero = code("../components/landing/Hero.tsx");
  const grid = code("../components/landing/ServicesGrid.tsx");
  assert.ok(hero.includes("WALLET_EXPLAINER"), "the hero shows a price with no wallet explanation");
  assert.ok(
    grid.includes("WALLET_EXPLAINER_SHORT"),
    "the services grid shows prices with no wallet explanation",
  );
});

test("no page offers a payment route this site does not have", () => {
  // Refunds promised money back "to the method you paid with" and had a
  // Chargebacks section about "your bank or card issuer". Top-ups are
  // USDT on BNB Smart Chain: there is no card, no bank and no provider
  // who can reverse anything.
  const pages = ["../pages/legal/Refunds.tsx", "../pages/legal/Terms.tsx"];
  const banned = [
    /credit card/i,
    /card issuer(?!,? or payment provider)/i,
    /raising a dispute with your bank/i,
    /original payment method/i,
    /the method you paid with/i,
  ];
  for (const page of pages) {
    const body = code(page);
    for (const pattern of banned) {
      assert.ok(!pattern.test(body), `${page} assumes a payment method this site does not take: ${pattern}`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
