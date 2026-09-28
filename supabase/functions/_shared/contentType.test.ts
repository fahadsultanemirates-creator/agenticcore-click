// Run with: node --experimental-strip-types supabase/functions/_shared/contentType.test.ts
//
// The bug this prevents is invisible until somebody opens the file: correct
// bytes, wrong label, and every em-dash and curly quote in a client's
// deliverable renders as mojibake.

import assert from 'node:assert/strict';
import { servableContentType } from './contentType.ts';

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

// The live failure: a caption pack served as bare text/plain.
test('text gets a charset', () => {
  assert.equal(servableContentType('text/plain'), 'text/plain; charset=utf-8');
  assert.equal(servableContentType('text/csv'), 'text/csv; charset=utf-8');
  assert.equal(servableContentType('text/html'), 'text/html; charset=utf-8');
});

test('structured text formats get one too', () => {
  assert.equal(servableContentType('application/json'), 'application/json; charset=utf-8');
  assert.equal(servableContentType('application/xml'), 'application/xml; charset=utf-8');
});

// A PDF carries its encoding internally; a charset on it is noise.
test('binary formats are left alone', () => {
  assert.equal(servableContentType('application/pdf'), 'application/pdf');
  assert.equal(servableContentType('image/png'), 'image/png');
  assert.equal(servableContentType('video/mp4'), 'video/mp4');
});

// Overriding a deliberate charset would corrupt the file rather than fix it.
test('an existing charset is never overridden', () => {
  assert.equal(servableContentType('text/plain; charset=windows-1252'), 'text/plain; charset=windows-1252');
  assert.equal(servableContentType('text/plain;charset=utf-8'), 'text/plain;charset=utf-8');
});

test('applying it twice changes nothing', () => {
  const once = servableContentType('text/plain');
  assert.equal(servableContentType(once), once);
});

test('a missing type is a safe default, not a guess', () => {
  assert.equal(servableContentType(null), 'application/octet-stream');
  assert.equal(servableContentType(''), 'application/octet-stream');
  assert.equal(servableContentType('   '), 'application/octet-stream');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
