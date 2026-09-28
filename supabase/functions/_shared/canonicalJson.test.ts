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

// The bug Grok Bot found by differential-testing their verifier against
// ours. The first version sorted the keys and then handed the rebuilt
// object to JSON.stringify, which puts integer-like keys in ascending
// NUMERIC order ahead of every string key -- so "10" came out after "9"
// instead of before it. Lexicographic sort is what the spec says, and now
// what the code does.
test('integer-like keys sort lexicographically, not numerically', () => {
  assert.equal(canonicalJson({ '10': 'a', '9': 'b', z: 'c' }), '{"10":"a","9":"b","z":"c"}');
  assert.equal(canonicalJson({ '2': 1, '10': 2, '1': 3 }), '{"1":3,"10":2,"2":1}');
});

test('integer-like keys sort the same whichever order they are built in', () => {
  assert.equal(canonicalJson({ '9': 1, '10': 2 }), canonicalJson({ '10': 2, '9': 1 }));
});

test('a numeric key mixed with string keys keeps one ordering', () => {
  assert.equal(canonicalJson({ b: 1, '7': 2, a: 3 }), '{"7":2,"a":3,"b":1}');
});

// A Date would otherwise serialise as its own (empty) key list.
test('values with toJSON resolve the way JSON.stringify resolves them', () => {
  assert.equal(canonicalJson({ at: new Date('2026-09-28T20:06:13.000Z') }), '{"at":"2026-09-28T20:06:13.000Z"}');
});

// Dropping the element instead would shift every index after it.
test('undefined inside an array becomes null, keeping positions', () => {
  assert.equal(canonicalJson({ xs: [1, undefined, 3] }), '{"xs":[1,null,3]}');
});

test('nested arrays of objects are sorted inside but kept in order', () => {
  assert.equal(canonicalJson([{ b: 1, '2': 2 }, { a: 3 }]), '[{"2":2,"b":1},{"a":3}]');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
