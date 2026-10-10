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
} from "./claims.ts";

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

test("the hero states the turnaround and qualifies it in the same breath", () => {
  assert.ok(HERO.includes("HEADLINE_TURNAROUND"), "the hero no longer states the turnaround");
  assert.ok(
    HERO.includes("CLAIM_SHORT"),
    "the hero states the turnaround with no qualifier — the original bug",
  );
});

test("the stats band still carries its footnote", () => {
  assert.ok(STATS.includes("CLAIM_FOOTNOTE"), "the stats footnote is gone");
  assert.ok(STATS.includes("HEADLINE_TURNAROUND"));
});

test("anything stating the turnaround also qualifies it", () => {
  // The real invariant, rather than a check on two named files: if a
  // component imports the headline number, it must import a qualifier too.
  for (const [name, text] of [
    ["Hero", HERO],
    ["StatsBand", STATS],
  ] as const) {
    if (!text.includes("HEADLINE_TURNAROUND")) continue;
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
