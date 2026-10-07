// Run with: node --experimental-strip-types supabase/functions/_shared/projectName.test.ts

import assert from 'node:assert/strict';
import { MAX_NAME_LENGTH, projectNameFrom } from './projectName.ts';

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

test('a stated business name wins over the brief', () => {
  assert.equal(
    projectNameFrom('Logo', { businessName: 'Noor Bakery', description: 'a warm handmade logo' }),
    'Noor Bakery'
  );
});

test('the brief is the name when nothing else is given', () => {
  assert.equal(projectNameFrom('Logo', { description: 'a logo for Noor Bakery' }), 'a logo for Noor Bakery');
});

test('the product is the last resort, never an empty heading', () => {
  assert.equal(projectNameFrom('Logo', {}), 'Logo');
  assert.equal(projectNameFrom('Logo', { description: '   ' }), 'Logo');
  assert.equal(projectNameFrom('', {}), 'New project');
});

test('a long brief becomes a label, cut on a word', () => {
  const name = projectNameFrom('Brochure', {
    description: 'A six page brochure for a family run plumbing company in Sharjah with prices and photos'
  });
  assert.ok(name.length <= MAX_NAME_LENGTH + 1, name);
  assert.ok(name.endsWith('…'), name);
  assert.ok(!name.includes(' …'), `no dangling space before the ellipsis: ${name}`);
});

// A single enormous token has no word to break on, and breaking anyway
// would leave a two-character name.
test('one very long word is cut hard rather than to nothing', () => {
  const name = projectNameFrom('Logo', { description: `ab ${'x'.repeat(200)}` });
  assert.ok(name.length > MAX_NAME_LENGTH * 0.9, name);
});

test('newlines and double spaces do not survive into a heading', () => {
  assert.equal(projectNameFrom('Logo', { description: 'a logo\nfor   Noor\tBakery' }), 'a logo for Noor Bakery');
});

test('a non-string payload value is ignored, not stringified', () => {
  assert.equal(projectNameFrom('Logo', { businessName: 42, description: 'a logo for Noor Bakery' }), 'a logo for Noor Bakery');
  assert.equal(projectNameFrom('Logo', { description: null, brief: 'a logo' }), 'a logo');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
