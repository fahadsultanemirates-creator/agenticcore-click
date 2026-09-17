// Run with: node --experimental-strip-types supabase/functions/_shared/offer.test.ts
import assert from 'node:assert/strict';
import { hasPricingDetail, pricingRequest } from './offer.ts';

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

test('the request names the product and shows the shape of an answer', () => {
  const message = pricingRequest('Brochure');
  assert.ok(message.includes('brochure'));
  assert.ok(message.includes('Starter'));
  assert.ok(/won't guess/i.test(message), 'must say it will not invent figures');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
