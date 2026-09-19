// Run with: node --experimental-strip-types supabase/functions/_shared/videoFormat.test.ts

import assert from 'node:assert/strict';
import { dimensionFor, landscape, portrait, resolutionIn } from './videoFormat.ts';

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

// The live bug: a short clip came back 720x1280, so the avatar sat in a
// letterboxed strip between two white bands.
test('a short 720p clip is landscape, not a tall white sandwich', () => {
  assert.deepEqual(dimensionFor({ length: 'short', resolution: '720p' }), { width: 1280, height: 720 });
});

test('1080p is 1920x1080', () => {
  assert.deepEqual(dimensionFor({ length: 'short', resolution: '1080p' }), { width: 1920, height: 1080 });
});

// A long video is watched on something bigger than a phone. `resolution` is
// only ever filled in for short clips, so reading it alone dropped every long
// video to 720p -- a regression nothing would have reported except a
// soft-looking video on a client's homepage.
test('a long video is 1080p without being asked', () => {
  assert.deepEqual(dimensionFor({ length: 'long' }), { width: 1920, height: 1080 });
});

// The short clip is the one doing the selling -- it is the first thing a
// prospective client ever sees -- and standard generation is billed by the
// minute rather than by the pixel, so the cheaper-looking default was not
// buying anything.
test('a short clip is 1080p too, without being asked', () => {
  assert.deepEqual(dimensionFor({ length: 'short' }), { width: 1920, height: 1080 });
  assert.deepEqual(dimensionFor({}), { width: 1920, height: 1080 });
});

test('what the order asked for still wins over the default', () => {
  assert.deepEqual(dimensionFor({ length: 'long', resolution: '720p' }), { width: 1280, height: 720 });
  assert.deepEqual(dimensionFor({ length: 'short', resolution: '720p' }), { width: 1280, height: 720 });
});

// A Telegram order is one line of free text with no structured fields, so
// words are the only way to ask for a quality from there.
test('a resolution asked for in words is recognised', () => {
  assert.equal(resolutionIn('15 second intro, make it 1080p'), '1080p');
  assert.equal(resolutionIn('short clip in full HD'), '1080p');
  assert.equal(resolutionIn('keep it 720p, it is just for a story'), '720p');
  assert.equal(resolutionIn('a 15 second intro for my agency'), null);
});

// "15 second" and "30 seconds" must never be read as a resolution.
test('a length in the brief is not mistaken for a quality', () => {
  assert.equal(resolutionIn('720 second explainer'), '720p');
  assert.equal(resolutionIn('a 60 second video about our services'), null);
  assert.equal(resolutionIn('10800 words'), null);
});

// Short and long disagreeing about which way up a video goes is what let the
// original mistake hide.
test('short and long agree on orientation', () => {
  const short = dimensionFor({ length: 'short', resolution: '1080p' });
  const long = dimensionFor({ length: 'long', resolution: '1080p' });
  assert.equal(short.width > short.height, long.width > long.height);
});

test('vertical happens only when it is asked for', () => {
  assert.deepEqual(dimensionFor({ aspect: '9:16', resolution: '720p' }), { width: 720, height: 1280 });
  assert.deepEqual(dimensionFor({ orientation: 'portrait' }), { width: 1080, height: 1920 });
  assert.deepEqual(dimensionFor({ resolution: '1080p' }), { width: 1920, height: 1080 });
});

test('every canvas is a real 16:9 rectangle either way up', () => {
  for (const height of [720, 1080]) {
    const wide = landscape(height);
    const tall = portrait(height);
    assert.equal(Math.round((wide.width / wide.height) * 100), 178, 'landscape must be 16:9');
    assert.equal(Math.round((tall.height / tall.width) * 100), 178, 'portrait must be 9:16');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
