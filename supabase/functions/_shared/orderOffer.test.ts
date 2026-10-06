// Run with: node --experimental-strip-types supabase/functions/_shared/orderOffer.test.ts

import assert from 'node:assert/strict';
import { CATALOG, type CatalogItem } from './catalog.ts';
import { calculatePriceUsd } from './pricing.ts';
import { clientCatalogue, describeOffer, suggestTopUp, TOPUP_TIERS, usd } from './orderOffer.ts';

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

const priceOf = (item: CatalogItem) => calculatePriceUsd(item.service, item.selector);

test('money always reads as money', () => {
  assert.equal(usd(3), '$3.00');
  assert.equal(usd(0), '$0.00');
  assert.equal(usd(12.5), '$12.50');
});

test('an affordable order asks for a yes and nothing else', () => {
  const offer = describeOffer({ productName: 'Logo', priceUsd: 1, balanceUsd: 10, brief: 'a bakery logo', revisions: 0 });
  assert.equal(offer.affordable, true);
  assert.equal(offer.shortfallUsd, 0);
  assert.match(offer.text, /YES/);
  assert.ok(!offer.text.includes('short'), 'told an affordable client they were short');
});

test('an unaffordable order says exactly how much is missing', () => {
  const offer = describeOffer({ productName: 'Website — large (5–10 pages)', priceUsd: 20, balanceUsd: 7.5, brief: 'a plumber', revisions: 2 });
  assert.equal(offer.affordable, false);
  assert.equal(offer.shortfallUsd, 12.5);
  assert.ok(offer.text.includes('$12.50'), offer.text);
  assert.ok(offer.text.includes('/topup 30'), offer.text);
});

test('an empty wallet is short the whole price', () => {
  const offer = describeOffer({ productName: 'Logo', priceUsd: 1, balanceUsd: 0, brief: 'x', revisions: 0 });
  assert.equal(offer.shortfallUsd, 1);
  assert.equal(offer.suggestedTopUpUsd, 10);
});

// Exactly enough is enough. An off-by-one here refuses an order the
// client can pay for and sends them to top up for nothing.
test('a wallet holding exactly the price can buy', () => {
  const offer = describeOffer({ productName: 'Video', priceUsd: 3, balanceUsd: 3, brief: 'x', revisions: 0 });
  assert.equal(offer.affordable, true);
  assert.equal(offer.shortfallUsd, 0);
});

// 20 - 9.999999999999998 is 10.000000000000002 in float, which without
// rounding skips the $10 tier and pushes the client to $30 over a
// hundredth of a cent.
test('a floating-point shortfall does not push the client up a tier', () => {
  assert.equal(suggestTopUp(10.000000000000002), 10);
  assert.equal(suggestTopUp(9.999999999999998), 10);
});

test('the smallest tier that covers the gap is the one offered', () => {
  assert.equal(suggestTopUp(0.5), 10);
  assert.equal(suggestTopUp(10), 10);
  assert.equal(suggestTopUp(10.01), 30);
  assert.equal(suggestTopUp(30), 30);
  assert.equal(suggestTopUp(31), 100);
  assert.equal(suggestTopUp(100), 100);
  assert.equal(suggestTopUp(101), 200);
});

test('a gap bigger than every tier offers the largest, not nothing', () => {
  assert.equal(suggestTopUp(5000), TOPUP_TIERS[TOPUP_TIERS.length - 1]);
});

test('the offer states what revisions the product includes', () => {
  const withRevisions = describeOffer({ productName: 'Website', priceUsd: 10, balanceUsd: 50, brief: 'x', revisions: 2 });
  assert.ok(withRevisions.text.includes('2 revisions'));
  const one = describeOffer({ productName: 'Flyer', priceUsd: 3, balanceUsd: 50, brief: 'x', revisions: 1 });
  assert.ok(one.text.includes('1 revision'), 'pluralised a single revision');
  assert.ok(!one.text.includes('1 revisions'));
  const none = describeOffer({ productName: 'Logo', priceUsd: 1, balanceUsd: 50, brief: 'x', revisions: 0 });
  assert.match(none.text, /No revisions/);
});

test('the offer repeats the brief back, so a misheard one is visible', () => {
  const offer = describeOffer({
    productName: 'Logo',
    priceUsd: 1,
    balanceUsd: 50,
    brief: 'warm, handmade, for a bakery called Pixel & Pine',
    revisions: 0,
  });
  assert.ok(offer.text.includes('Pixel & Pine'));
});

// The owner's menu leaks SKU numbers and service keys; a client reading
// "30 = Logo [image]" learns nothing and is invited to type "order 30".
test('the client catalogue shows names and prices, never SKUs or internals', () => {
  const text = clientCatalogue(priceOf);
  assert.ok(text.includes('Logo'));
  assert.ok(text.includes('$'));
  assert.ok(!/\b\d{2} = /.test(text), 'leaked a SKU number');
  assert.ok(!text.includes('[image]'), 'leaked a service key');
  assert.ok(!text.includes('also called:'), 'leaked routing aliases');
});

test('the client catalogue never lists an owner-only product', () => {
  const text = clientCatalogue(priceOf);
  for (const item of CATALOG.filter((i) => i.ownerOnly)) {
    assert.ok(!text.includes(item.name), `${item.name} is owner-only and was listed`);
  }
});

// A product in the catalogue that the pricer cannot price is a product
// a client could be quoted nothing for. It must not appear.
test('every product listed has a real price', () => {
  const text = clientCatalogue(priceOf);
  for (const item of CATALOG) {
    if (item.ownerOnly) continue;
    const price = priceOf(item);
    if (price === null) {
      assert.ok(!text.includes(item.name), `${item.name} has no price but was listed`);
    } else {
      assert.ok(text.includes(item.name), `${item.name} is sellable at ${price} but was not listed`);
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
