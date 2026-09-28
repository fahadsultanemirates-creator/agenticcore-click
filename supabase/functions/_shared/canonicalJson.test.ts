// Run with: node --experimental-strip-types supabase/functions/_shared/canonicalJson.test.ts
//
// Both sides must produce byte-identical text from the same data, or every
// signature fails for a reason invisible in the payload.

import assert from 'node:assert/strict';
import { canonicalJson } from './canonicalJson.ts';

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

// The actual hazard: the same object built in two orders.
test('key order does not change the output', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test('nested objects are sorted too', () => {
  assert.equal(canonicalJson({ z: { d: 1, c: 2 }, a: 3 }), '{"a":3,"z":{"c":2,"d":1}}');
});

// Arrays are ordered data. Sorting them would change what they mean.
test('array order is preserved', () => {
  assert.equal(canonicalJson({ items: [3, 1, 2] }), '{"items":[3,1,2]}');
  assert.equal(canonicalJson([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test('there is no whitespace between tokens', () => {
  const out = canonicalJson({ a: 1, b: { c: 2 } });
  assert.equal(out, '{"a":1,"b":{"c":2}}');
  assert.ok(!/\s/.test(out));
});

// Explicitly required: & must stay &, never &amp;.
test('nothing is HTML-escaped', () => {
  assert.equal(canonicalJson({ brief: 'Tom & Jerry <b>' }), '{"brief":"Tom & Jerry <b>"}');
});

test('non-ASCII survives as itself', () => {
  assert.equal(canonicalJson({ note: 'café — naïve' }), '{"note":"café — naïve"}');
});

test('null and empty values are preserved, not dropped', () => {
  assert.equal(canonicalJson({ b: null, a: '' }), '{"a":"","b":null}');
});

// JSON.stringify drops undefined; the key list must match what is actually
// serialised, or the two sides disagree about which keys exist.
test('undefined values are absent, matching what is serialised', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
});

// The real shape, built in a deliberately awkward order.
test('a notice payload canonicalises the same either way', () => {
  const a = {
    type: 'task',
    job: { token: 'x', id: 'j1', acceptBy: '2026-09-28T20:06:13Z' },
    task: { sku: 52, reference: 'AC-1001-01', brief: 'captions', product: 'Caption & hashtag pack' },
    callback: 'https://example.test/cb'
  };
  const b = {
    callback: 'https://example.test/cb',
    task: { brief: 'captions', product: 'Caption & hashtag pack', reference: 'AC-1001-01', sku: 52 },
    job: { acceptBy: '2026-09-28T20:06:13Z', id: 'j1', token: 'x' },
    type: 'task'
  };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.ok(canonicalJson(a).includes('Caption & hashtag pack'), 'the ampersand must survive');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
