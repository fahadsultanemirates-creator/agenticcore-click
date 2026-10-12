// Run with: node --experimental-strip-types src/data/walletTiers.test.ts
//
// The wallet tiers exist twice: src/data/packages.ts drives the cards a
// customer reads, and supabase/functions/_shared/orderOffer.ts drives
// applyDiscount(), which decides what the wallet is actually debited.
//
// They are in different deploy units -- Netlify ships one, Supabase ships
// the other -- so they can be changed independently, and a mismatch means
// advertising one discount and charging another. That is the single worst
// bug this product could have, and nothing was comparing them.

import assert from "node:assert/strict";
import process from "node:process";
import { walletPackages } from "./packages.ts";
import { WALLET_PACKAGES } from "../../supabase/functions/_shared/orderOffer.ts";
import { applyDiscount } from "../../supabase/functions/_shared/discount.ts";

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

test("the cards and the charging code list the same tiers", () => {
  assert.equal(
    walletPackages.length,
    WALLET_PACKAGES.length,
    "the site shows a different number of tiers than the server prices",
  );
  for (const card of walletPackages) {
    const server = WALLET_PACKAGES.find((p) => p.tier === card.id);
    assert.ok(server, `the site offers ${card.id}, which the server does not price`);
    assert.equal(
      card.price,
      `$${server.amountUsd}`,
      `${card.id}: card says ${card.price}, server says $${server.amountUsd}`,
    );
    assert.equal(
      card.firstTimeDiscount,
      server.firstOrderDiscount,
      `${card.id}: card advertises ${card.firstTimeDiscount}% first-order, server applies ${server.firstOrderDiscount}%`,
    );
    assert.equal(
      card.routineDiscount,
      server.routineDiscount,
      `${card.id}: card advertises ${card.routineDiscount}% routine, server applies ${server.routineDiscount}%`,
    );
  }
});

test("a customer is charged the percentage their card promised", () => {
  // Not a restatement of the table: this runs the real pricing function.
  for (const card of walletPackages) {
    const first = applyDiscount(100, { tier: card.id, isFirstOrder: true });
    assert.equal(
      first.discountPct,
      card.firstTimeDiscount,
      `${card.id} first order: promised ${card.firstTimeDiscount}%, charged ${first.discountPct}%`,
    );

    const later = applyDiscount(100, { tier: card.id, isFirstOrder: false });
    assert.equal(
      later.discountPct,
      card.routineDiscount,
      `${card.id} later order: promised ${card.routineDiscount}%, charged ${later.discountPct}%`,
    );
  }
});

test("the discount follows the top-up, not the order size", () => {
  // This is the ambiguity the old one-sentence version left open, and the
  // table now states an answer. If the implementation ever stops agreeing
  // with that answer, the table becomes a lie.
  const tier = "wallet-100";
  const small = applyDiscount(1, { tier, isFirstOrder: true });
  const large = applyDiscount(500, { tier, isFirstOrder: true });
  assert.equal(
    small.discountPct,
    large.discountPct,
    "the percentage changed with the order size — the table says it does not",
  );
});

test("the two discounts never stack", () => {
  const tier = "wallet-200";
  const first = applyDiscount(100, { tier, isFirstOrder: true });
  const combined = walletPackages.find((p) => p.id === tier)!;
  assert.ok(
    first.discountPct < combined.firstTimeDiscount + combined.routineDiscount,
    "a first order took both discounts",
  );
  assert.equal(first.discountPct, combined.firstTimeDiscount);
});

test("$10 is the minimum top-up, and the cards say so", () => {
  const cheapest = Math.min(...WALLET_PACKAGES.map((p) => p.amountUsd));
  assert.equal(cheapest, 10);
  const card = walletPackages.find((p) => p.price === "$10");
  assert.ok(card?.note, "the $10 tier should carry the note that it is the minimum");
  assert.match(card.note, /minimum/i);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
