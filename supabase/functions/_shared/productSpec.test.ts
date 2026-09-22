// Tests for product definitions and the requirements gate. Run with:
//   node --experimental-strip-types supabase/functions/_shared/productSpec.test.ts
//
// Two kinds of test live here, and the first kind matters more.
//
// STRUCTURAL tests assert that every composed product HAS a definition at
// all. That is the actual failure this work exists to end: the letterhead and
// the brochure did not fail because their specs were wrong, they failed
// because no spec existed and nobody noticed until a deliverable came back
// looking finished and being useless. A product added next month with no
// definition would fail exactly the same way, silently -- unless a test fails
// loudly first.
//
// BEHAVIOURAL tests assert the gate's one rule: required facts are asked for,
// optional ones are omitted, and nothing is ever invented.

import assert from 'node:assert/strict';
import { CATALOG, deliveryOf, needsPricing, specOf } from './catalog.ts';
import { FIELDS, SPECS, specFor, specInstruction } from './productSpec.ts';
import { missingRequired, infoRequest, type BrandFacts } from './requirements.ts';

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

// ---- Structural: nothing composed may go undefined --------------------

test('every composed product has a definition', () => {
  const undefinedOnes = CATALOG.filter((item) => deliveryOf(item) === 'composed' && !specOf(item));
  assert.equal(
    undefinedOnes.length,
    0,
    `these products are built by us and have no spec, so nothing states what they are: ${undefinedOnes
      .map((item) => `${item.sku} ${item.name}`)
      .join('; ')}`
  );
});

test('every spec answers what would make the product wrong', () => {
  for (const [sku, spec] of Object.entries(SPECS)) {
    assert.ok(spec.purpose.length > 20, `sku ${sku} has no real purpose`);
    assert.ok(spec.wrongWhen.length > 20, `sku ${sku} does not say what would make it wrong`);
    assert.ok(spec.rules.length > 0, `sku ${sku} states no rules`);
  }
});

// Rules and recipe are not the same thing, and only having one of them is
// what every live failure looked like. The rules said a brochure needs an
// offer; nothing said where in the brochure the offer goes. A product with
// rules and no steps will fail the same way, so it fails here first.
test('every product says how to build it, in order', () => {
  for (const [sku, spec] of Object.entries(SPECS)) {
    assert.ok(spec.build.length >= 2, `sku ${sku} has no build recipe — nothing says what to put where`);
    for (const step of spec.build) {
      assert.ok(step.length > 10, `sku ${sku} has a build step too short to act on: "${step}"`);
    }
  }
});

test('the recipe reaches the prompt as a numbered sequence', () => {
  const text = specInstruction(specFor(60));
  assert.ok(text.includes('How to build it, in this order:'), 'the recipe is missing from the prompt');
  assert.ok(text.includes('1. Header:'), 'the steps are not numbered');
  assert.ok(text.indexOf('Rules you must obey') < text.indexOf('How to build it'), 'rules come before the steps');
});

test('every field a spec names actually exists', () => {
  for (const [sku, spec] of Object.entries(SPECS)) {
    for (const key of [...spec.must, ...spec.nice]) {
      assert.ok(FIELDS[key], `sku ${sku} requires unknown field "${key}"`);
    }
  }
});

// A required field with no way to look it up would be missing forever, which
// would stop the product from ever being buildable. missingRequired treats an
// unresolvable field as absent precisely so this test can catch it.
test('every required field can actually be looked up', () => {
  const everything: BrandFacts = {
    url: 'https://example.com',
    businessName: 'Example',
    description: 'We do things',
    primaryColor: '#123456',
    services: ['a', 'b'],
    packages: [{ name: 'Starter', price: '$10' }],
    contact: { email: 'a@b.com', phone: '123', address: '1 Road, Dubai, UAE' }
  };
  const brief = { description: 'A reasonably detailed brief about what this business does and sells.' };

  for (const [sku, spec] of Object.entries(SPECS)) {
    assert.deepEqual(
      missingRequired(spec, brief, everything),
      [],
      `sku ${sku} still reports missing fields even when every fact is known`
    );
  }
});

test('the provider column is left undefined on purpose', () => {
  // Websites, images and videos are delivered whole by an API that already
  // knows what they are. A spec here would be us overriding something that
  // has never needed a second attempt.
  for (const item of CATALOG) {
    if (deliveryOf(item) === 'provider') assert.equal(specFor(item.sku), null, `${item.sku} should have no spec`);
  }
});

test('the three delivery kinds land where they should', () => {
  const kind = (sku: number) => deliveryOf(CATALOG.find((item) => item.sku === sku)!);
  assert.equal(kind(10), 'provider', 'a website is made by Grok');
  // HeyGen renders the presenter, but the words it speaks are ours -- which
  // is the same split as a QR code on a card.
  assert.equal(kind(40), 'hybrid', 'HeyGen renders it; the script is ours');
  assert.equal(kind(30), 'provider', 'a logo is an image, made by Grok');
  assert.equal(kind(72), 'composed', 'a letterhead is HTML we wrote');
  assert.equal(kind(21), 'composed', 'a brochure is HTML we wrote');
  assert.equal(kind(75), 'hybrid', 'the QR code is generated; the card is ours');
  assert.equal(kind(50), 'hybrid', 'the graphic is generated; the crop and word count are ours');
});

// Revisions are not a spec question but they are a promise, and the user's
// rule is exactly the catalog's: a document can be edited, a video can only be
// re-rolled at full cost.
test('nothing that can only be regenerated promises a revision', () => {
  for (const item of CATALOG) {
    if (item.renderer === 'images' || item.renderer === 'video' || item.renderer === 'qr') {
      assert.equal(item.revisions, 0, `${item.sku} ${item.name} promises a revision it cannot cheaply honour`);
    }
  }
});

// ---- Behavioural: ask, or omit. Never invent. -------------------------

const SITE: BrandFacts = {
  url: 'https://agenticcore.agency',
  businessName: 'AgenticCore',
  primaryColor: '#0d9488',
  services: ['AI agents', 'automation'],
  contact: { email: 'hello@agenticcore.agency' }
};

test('a brochure with no prices anywhere stops and asks', () => {
  const missing = missingRequired(specFor(21), { description: 'A brochure for our agency' }, SITE);
  assert.deepEqual(missing, ['packages']);
});

test("a brochure whose prices are on the client's own site is built, not queried", () => {
  const withPrices = { ...SITE, packages: [{ name: 'Starter', price: '$499' }] };
  assert.deepEqual(missingRequired(specFor(21), { description: 'A brochure for our agency' }, withPrices), []);
});

// The letterhead the owner accepted had no address and no phone number on the
// site, and was correct without them. Optional facts must never gate.
test('a letterhead builds with no address and no phone', () => {
  const thin: BrandFacts = { url: 'https://agenticcore.agency', businessName: 'AgenticCore' };
  assert.deepEqual(missingRequired(specFor(72), { description: 'letterhead' }, thin), []);
});

test('a letterhead with no business name anywhere asks for it', () => {
  assert.deepEqual(missingRequired(specFor(72), { description: 'letterhead please' }, null), ['businessName']);
});

// A QR code is the one deliverable nobody proof-reads. Its destination has to
// come from somewhere real.
test('a QR product with no destination anywhere asks for the link', () => {
  assert.deepEqual(missingRequired(specFor(75), { description: 'qr card please' }, null), ['targetUrl']);
});

test('a QR product takes the destination from a link in the brief', () => {
  assert.deepEqual(missingRequired(specFor(75), { description: 'qr card pointing at mybakery.com/menu' }, null), []);
});

test('legal text will not pick a jurisdiction on the client behalf', () => {
  const noAddress: BrandFacts = { url: 'https://x.com', businessName: 'X Ltd' };
  assert.deepEqual(missingRequired(specFor(61), { description: 'terms and privacy policy' }, noAddress), ['jurisdiction']);
});

test('an address on the site is accepted as where they operate', () => {
  const withAddress: BrandFacts = { url: 'https://x.com', businessName: 'X Ltd', contact: { address: 'Dubai, UAE' } };
  assert.deepEqual(missingRequired(specFor(61), { description: 'terms and privacy policy' }, withAddress), []);
});

// Three round trips is how an order two minutes from being built gets
// abandoned.
test('everything missing is asked for in one message', () => {
  const missing = missingRequired(specFor(63), { description: 'proposal template' }, null);
  assert.deepEqual(missing.sort(), ['businessName', 'packages']);
  const message = infoRequest('Proposal / quote template', missing);
  assert.ok(message.includes('2 things'));
  assert.ok(message.includes('packages'));
  assert.ok(message.includes('business name'));
  assert.ok(/won't invent/i.test(message), 'must promise not to invent the answer');
});

test('one missing thing is asked for as one thing', () => {
  assert.ok(infoRequest('Brochure', ['packages']).includes('one thing'));
});

test('needsPricing is derived from the spec, not stored twice', () => {
  const brochure = CATALOG.find((item) => item.sku === 21)!;
  const letterhead = CATALOG.find((item) => item.sku === 72)!;
  assert.equal(needsPricing(brochure), true);
  assert.equal(needsPricing(letterhead), false);
});

// The prompt must carry the failure mode, because "what would make this wrong
// even if it looks good" is the sentence that was missing every single time.
test('the prompt carries the purpose, the failure mode and the omit rule', () => {
  const text = specInstruction(specFor(72));
  assert.ok(text.includes('types their own letter'), 'purpose missing');
  assert.ok(/WRONG even if it looks good/.test(text), 'failure mode missing');
  assert.ok(/never invent/i.test(text), 'the omit-never-invent rule is missing');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
