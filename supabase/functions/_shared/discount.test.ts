// Run with: node --experimental-strip-types supabase/functions/_shared/discount.test.ts

import assert from 'node:assert/strict';
import { WALLET_PACKAGES } from './orderOffer.ts';
import { applyDiscount, discountLine } from './discount.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const first = (tier: string | null) => ({ tier, isFirstOrder: true });
const later = (tier: string | null) => ({ tier, isFirstOrder: false });

// The exact case in the test plan: $10 package, first order, $1 logo.
test('the advertised first-order discount is the one charged', () => {
  const priced = applyDiscount(1, first('wallet-10'));
  assert.equal(priced.discountPct, 15);
  assert.equal(priced.chargeUsd, 0.85);
  assert.equal(priced.savedUsd, 0.15);
  assert.equal(priced.reason, 'first-order');
});

test('every tier charges exactly what its card advertises', () => {
  for (const pkg of WALLET_PACKAGES) {
    assert.equal(applyDiscount(100, first(pkg.tier)).discountPct, pkg.firstOrderDiscount, `${pkg.tier} first`);
    assert.equal(applyDiscount(100, later(pkg.tier)).discountPct, pkg.routineDiscount, `${pkg.tier} later`);
  }
});

// 15% + 0% at the $10 tier looks harmless; 65% + 30% at $200 is a 95%
// discount nobody intended and no card describes.
test('the two discounts never stack', () => {
  for (const pkg of WALLET_PACKAGES) {
    const priced = applyDiscount(100, first(pkg.tier));
    assert.equal(priced.discountPct, pkg.firstOrderDiscount, pkg.tier);
    assert.ok(priced.discountPct <= 65, `${pkg.tier} gave ${priced.discountPct}%`);
  }
});

test('a wallet never topped up gets no discount', () => {
  for (const context of [first(null), later(null), first('wallet-999')]) {
    const priced = applyDiscount(10, context);
    assert.equal(priced.discountPct, 0);
    assert.equal(priced.chargeUsd, 10);
    assert.equal(priced.reason, 'none');
  }
});

// The $10 tier has no standing discount. A later order on it must be
// full price, not an error and not a free one.
test('a tier with no standing discount charges full price after the first order', () => {
  const priced = applyDiscount(3, later('wallet-10'));
  assert.equal(priced.discountPct, 0);
  assert.equal(priced.chargeUsd, 3);
  assert.equal(priced.reason, 'none');
});

// $3 at 10% off is 2.7000000000000002 in floating point. Charging that
// is a number no currency can express.
test('every charge is a whole number of cents', () => {
  for (const list of [1, 2, 3, 5, 10, 20, 0.99, 7.77, 12.34]) {
    for (const pkg of WALLET_PACKAGES) {
      for (const ctx of [first(pkg.tier), later(pkg.tier)]) {
        const { chargeUsd, savedUsd } = applyDiscount(list, ctx);
        assert.equal(chargeUsd, Math.round(chargeUsd * 100) / 100, `${list} ${pkg.tier}`);
        assert.equal(savedUsd, Math.round(savedUsd * 100) / 100, `${list} ${pkg.tier}`);
      }
    }
  }
});

test('the specific float trap: $3 at 10% is 2.70, not 2.7000000000000002', () => {
  assert.equal(applyDiscount(3, later('wallet-30')).chargeUsd, 2.7);
});

test('what is charged plus what is saved is always the list price', () => {
  for (const list of [1, 3, 20, 0.05, 99.99]) {
    for (const pkg of WALLET_PACKAGES) {
      const p = applyDiscount(list, first(pkg.tier));
      assert.equal(
        Math.round((p.chargeUsd + p.savedUsd) * 100),
        Math.round(p.listUsd * 100),
        `${list} ${pkg.tier}`
      );
    }
  }
});

test('a charge is never negative and never above list', () => {
  for (const list of [0, 0.01, 1, 1000]) {
    for (const pkg of WALLET_PACKAGES) {
      for (const ctx of [first(pkg.tier), later(pkg.tier)]) {
        const { chargeUsd, listUsd } = applyDiscount(list, ctx);
        assert.ok(chargeUsd >= 0, `${list} went negative`);
        assert.ok(chargeUsd <= listUsd, `${list} charged more than list`);
      }
    }
  }
});

test('a free or nonsensical price is left alone', () => {
  assert.equal(applyDiscount(0, first('wallet-200')).chargeUsd, 0);
  assert.equal(applyDiscount(-5, first('wallet-200')).discountPct, 0);
});

// The flagship is the thing the website promises the first-order
// discount covers, in as many words.
test('the $20 bundle is discounted like anything else', () => {
  const priced = applyDiscount(20, first('wallet-30'));
  assert.equal(priced.discountPct, 30);
  assert.equal(priced.chargeUsd, 14);
});

test('the line a client reads names both prices', () => {
  const line = discountLine(applyDiscount(1, first('wallet-10')))!;
  assert.ok(line.includes('15%'), line);
  assert.ok(line.includes('$1.00'), line);
  assert.ok(line.includes('$0.85'), line);
  assert.ok(line.includes('first order'), line);

  const tierLine = discountLine(applyDiscount(3, later('wallet-100')))!;
  assert.ok(tierLine.includes('20%'), tierLine);
  assert.ok(tierLine.includes('$2.40'), tierLine);
  assert.ok(!tierLine.includes('first order'), tierLine);
});

test('no discount means nothing to say, not an empty sentence', () => {
  assert.equal(discountLine(applyDiscount(1, later('wallet-10'))), null);
  assert.equal(discountLine(applyDiscount(1, first(null))), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
