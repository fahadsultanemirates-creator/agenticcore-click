// Run with: node --experimental-strip-types supabase/functions/_shared/offer.test.ts
import assert from 'node:assert/strict';
import { briefHasPricing as hasPricingDetail, hasOffer } from './offer.ts';

let passed = 0, failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (err) { failed++; console.error(`FAIL  ${name}\n      ${(err as Error).message}`); }
}

test('a brief with real figures counts', () => {
  assert.ok(hasPricingDetail({ description: 'Brochure. Starter $49/mo, Growth $149/mo, Enterprise from $499.' }));
  assert.ok(hasPricingDetail({ brief: 'packages: 2500 AED setup, 900 AED monthly' }));
  assert.ok(hasPricingDetail({ description: 'plans start from £1,200 per project' }));
  assert.ok(hasPricingDetail({ description: 'Rs 5000 per session' }));
});

test('an explicit field always counts', () => {
  assert.ok(hasPricingDetail({ pricing: 'ask us' }));
  assert.ok(hasPricingDetail({ packages: ['Starter', 'Pro'] }));
});

// The case that produced a brochure with no offer in it.
test('a brief with no figures does not count', () => {
  assert.equal(hasPricingDetail({ description: 'brochure for agenticcore.agency' }), false);
  assert.equal(hasPricingDetail({}), false);
  assert.equal(hasPricingDetail({ description: '' }), false);
});

test('talking about packages without figures is not an offer', () => {
  assert.equal(hasPricingDetail({ description: 'mention our packages and how good they are' }), false);
});

// Most businesses publish their packages on their landing page. Asking for
// figures a client has already printed on their own homepage is the kind of
// thing that makes a system feel stupid.
test('an offer on the client site counts, with no brief needed', () => {
  const profile = { packages: [{ name: 'Starter', price: '$10' }, { name: 'Growth', price: '$20' }] };
  assert.ok(hasOffer({ description: 'brochure for agenticcore.agency' }, profile));
});

test('a package list with no figures is a menu, not an offer', () => {
  assert.equal(hasOffer({ description: 'brochure' }, { packages: [{ name: 'Starter' }] }), false);
  assert.equal(hasOffer({ description: 'brochure' }, { packages: [{ name: 'Growth', price: '  ' }] }), false);
});

test('with neither brief nor site, it asks', () => {
  assert.equal(hasOffer({ description: 'brochure' }, null), false);
  assert.equal(hasOffer({ description: 'brochure' }, { packages: [] }), false);
});

test('the brief still counts on its own', () => {
  assert.ok(hasOffer({ description: 'Starter $49, Growth $149' }, null));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
