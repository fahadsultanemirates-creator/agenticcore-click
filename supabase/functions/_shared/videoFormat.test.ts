// Run with: node --experimental-strip-types supabase/functions/_shared/videoFormat.test.ts

import assert from 'node:assert/strict';
import { dimensionFor, landscape, portrait } from './videoFormat.ts';

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

test('a short clip stays 720p without being asked', () => {
  assert.deepEqual(dimensionFor({ length: 'short' }), { width: 1280, height: 720 });
});

test('what the order asked for still wins over the length default', () => {
  assert.deepEqual(dimensionFor({ length: 'long', resolution: '720p' }), { width: 1280, height: 720 });
  assert.deepEqual(dimensionFor({ length: 'short', resolution: '1080p' }), { width: 1920, height: 1080 });
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
  assert.deepEqual(dimensionFor({ orientation: 'portrait' }), { width: 720, height: 1280 });
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
