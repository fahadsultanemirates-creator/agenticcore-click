// Run with: node --experimental-strip-types supabase/functions/_shared/deliverTo.test.ts

import assert from 'node:assert/strict';
import { extensionOf, sendKindFor } from './deliverTo.ts';

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

test('a recorded mime type decides it', () => {
  assert.equal(sendKindFor({ fileType: 'image/png', url: 'x' }), 'photo');
  assert.equal(sendKindFor({ fileType: 'video/mp4', url: 'x' }), 'video');
  assert.equal(sendKindFor({ fileType: 'audio/mpeg', url: 'x' }), 'audio');
  assert.equal(sendKindFor({ fileType: 'application/pdf', url: 'x' }), 'document');
  assert.equal(sendKindFor({ fileType: 'application/zip', url: 'x' }), 'document');
});

// A file the owner delivered by hand through the bot is recorded as
// "manual" with no usable type. The extension is all there is.
test('a hand-delivered file falls back to its extension', () => {
  assert.equal(sendKindFor({ fileType: 'manual', url: 'https://x/logo.png' }), 'photo');
  assert.equal(sendKindFor({ fileType: 'manual', url: 'https://x/clip.mp4' }), 'video');
  assert.equal(sendKindFor({ fileType: 'manual', url: 'https://x/brochure.pdf' }), 'document');
  assert.equal(sendKindFor({ fileType: null, url: 'https://x/shot.JPEG' }), 'photo');
  assert.equal(sendKindFor({ fileType: '', url: 'https://x/site.zip' }), 'document');
});

// A signed storage URL ends in "?token=...". Reading the extension off
// the whole string finds "png?token=abc" and matches nothing.
test('a query string does not hide the extension', () => {
  assert.equal(extensionOf('https://x/logo.png?token=abc&v=2'), 'png');
  assert.equal(extensionOf('https://x/logo.png#preview'), 'png');
  assert.equal(sendKindFor({ fileType: 'manual', url: 'https://x/logo.png?token=abc' }), 'photo');
});

test('a url with no extension at all is a document, not a crash', () => {
  assert.equal(extensionOf('https://x/download'), '');
  assert.equal(extensionOf(''), '');
  assert.equal(sendKindFor({ fileType: 'manual', url: 'https://x/download' }), 'document');
});

// Telegram renders an SVG as a broken image. It is a file, not a picture.
test('an svg goes as a document', () => {
  assert.equal(sendKindFor({ fileType: 'image/svg+xml', url: 'https://x/logo.svg' }), 'document');
});

// Guessing "photo" on a 40MB archive is a failed send and a client who
// gets nothing. Document is wrong-but-harmless.
test('anything unrecognised goes as a document', () => {
  for (const url of ['https://x/thing.xyz', 'https://x/a.b.c.qqq', 'https://x/']) {
    assert.equal(sendKindFor({ fileType: 'manual', url }), 'document', url);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
