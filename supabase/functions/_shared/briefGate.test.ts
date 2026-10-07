// Run with: node --experimental-strip-types supabase/functions/_shared/briefGate.test.ts

import assert from 'node:assert/strict';
import { briefGap, contentWords } from './briefGate.ts';

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

const logo = (brief: string) => briefGap({ productName: 'Logo', service: 'image', brief });

// The brief that got through and reached the owner as the whole job.
test('the brief that started this is rejected', () => {
  assert.notEqual(logo('Client wants a logo created.'), null);
});

test('a brief that only names the product is rejected', () => {
  for (const brief of ['a logo', 'I want a logo', 'logo please', 'make me a new logo', 'need a logo design']) {
    assert.notEqual(logo(brief), null, `should have been rejected: ${brief}`);
  }
});

test('an empty brief is rejected and says so without an empty quote', () => {
  const gap = logo('   ');
  assert.notEqual(gap, null);
  assert.match(gap!, /\(nothing\)/);
});

test('a brief naming the business and its trade passes', () => {
  assert.equal(logo('a logo for Noor Bakery, a small bakery in Dubai'), null);
  assert.equal(logo('logo for Pixel & Pine, warm and handmade'), null);
});

// Two content words is the line. "my restaurant" names a trade and no
// business, which is the case where asking is worth the round trip.
test('a trade with no name is still asked about', () => {
  assert.notEqual(logo('a logo for my restaurant'), null);
  assert.equal(logo('a logo for my restaurant Al Safa Grill'), null);
});

test('the product name is not counted as content', () => {
  assert.deepEqual(contentWords('a Business card for Noor Bakery', 'Business card'), ['noor', 'bakery']);
});

test('the question names the product and what to send', () => {
  const gap = briefGap({ productName: 'Promo video', service: 'video', brief: 'a video' });
  assert.match(gap!, /promo video/);
  assert.match(gap!, /what the video should say/);
});

test('each service asks for what that service needs', () => {
  assert.match(briefGap({ productName: 'Website', service: 'website', brief: 'a site' })!, /how many pages/);
  assert.match(briefGap({ productName: 'Brochure', service: 'pdf', brief: 'a brochure' })!, /needs to say/);
  assert.match(briefGap({ productName: 'Post pack', service: 'social', brief: 'posts' })!, /posts should be about/);
});

test('an unknown service still asks something sensible', () => {
  assert.match(briefGap({ productName: 'Mystery', service: 'nope', brief: 'one' })!, /what the business is called/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
