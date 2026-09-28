// Run with: node --experimental-strip-types supabase/functions/_shared/deliverableTypes.test.ts
//
// This decides what an outside process is allowed to publish on our own
// domain, to a paying client. Every test here is something that must not
// get through, and the list is the kind of thing somebody widens later
// "just for this one case".

import assert from 'node:assert/strict';
import { fileProblem } from './deliverableTypes.ts';

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

test('the ordinary deliverables pass', () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'video/mp4', 'text/csv']) {
    assert.equal(fileProblem(type, 1024), null, `${type} should be publishable`);
  }
});

// SVG is an image everywhere except in a browser, where it is a document
// that can carry script -- served from our domain, to our clients.
test('SVG is refused however it is spelled', () => {
  assert.ok(fileProblem('image/svg+xml', 1024));
  assert.ok(fileProblem('IMAGE/SVG+XML', 1024));
  assert.ok(fileProblem('image/svg+xml; charset=utf-8', 1024));
});

test('anything that renders as a page is refused', () => {
  for (const type of ['text/html', 'application/xhtml+xml', 'text/javascript', 'application/x-httpd-php']) {
    assert.ok(fileProblem(type, 1024), `${type} must not be publishable`);
  }
});

test('a parameterised content type is still recognised', () => {
  assert.equal(fileProblem('application/pdf; charset=binary', 2048), null);
  assert.equal(fileProblem('  application/pdf  ', 2048), null);
});

// An agent that asked for an upload URL and never used it, then submitted.
test('an empty file is refused', () => {
  assert.ok(fileProblem('application/pdf', 0));
});

test('an oversized file is refused, and says how big', () => {
  const problem = fileProblem('video/mp4', 80 * 1024 * 1024);
  assert.ok(problem);
  assert.ok(problem!.includes('80 MB'), `should name the size, got: ${problem}`);
});

test('a file right at the limit is allowed', () => {
  assert.equal(fileProblem('video/mp4', 50 * 1024 * 1024), null);
});

test('an undeclared type is refused rather than guessed at', () => {
  assert.ok(fileProblem(null, 1024));
  assert.ok(fileProblem('', 1024));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
