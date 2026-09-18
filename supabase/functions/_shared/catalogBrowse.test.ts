// Run with: node --experimental-strip-types supabase/functions/_shared/catalogBrowse.test.ts

import assert from 'node:assert/strict';
import { paginate, parseBrowseArgs, browseFooter } from './catalogBrowse.ts';

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

test('a bare command is page one, no filter', () => {
  assert.deepEqual(parseBrowseArgs(undefined), { filter: undefined, page: 1 });
  assert.deepEqual(parseBrowseArgs('   '), { filter: undefined, page: 1 });
});

test('filter and page are recognised in either order', () => {
  assert.deepEqual(parseBrowseArgs(' female 3'), { filter: 'female', page: 3 });
  assert.deepEqual(parseBrowseArgs(' 3 female'), { filter: 'female', page: 3 });
});

test('a multi-word filter survives', () => {
  assert.deepEqual(parseBrowseArgs(' blue suit 2'), { filter: 'blue suit', page: 2 });
});

// 1266 avatars is 254 pages. Asking for page 900 is a typo, and showing an
// empty page in answer to a typo just looks broken.
test('a page past the end clamps to the last real page', () => {
  const p = paginate(1266, 900);
  assert.equal(p.page, 254);
  assert.equal(p.to, 1266);
});

test('page zero or negative clamps to the first page', () => {
  assert.deepEqual(paginate(20, 0).page, 1);
  assert.deepEqual(paginate(20, -5).page, 1);
});

test('an exact multiple of the page size does not add an empty page', () => {
  assert.equal(paginate(10, 1).pages, 2);
  assert.equal(paginate(10, 2).to, 10);
});

test('an empty list is still one page, not zero', () => {
  assert.equal(paginate(0, 1).pages, 1);
});

test('the footer offers the next page, and stops offering it at the end', () => {
  assert.ok(browseFooter('avatars', 'female', paginate(12, 1), 12).includes('/avatars female 2'));
  assert.ok(!browseFooter('avatars', 'female', paginate(12, 3), 12).includes('Next'));
});

test('the footer counts from one, not zero', () => {
  assert.ok(browseFooter('voices', undefined, paginate(12, 2), 12).startsWith('Showing 6-10 of 12'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
