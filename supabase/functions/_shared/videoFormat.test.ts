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

test('an unspecified resolution is 720p rather than the expensive one', () => {
  assert.deepEqual(dimensionFor({ length: 'short' }), { width: 1280, height: 720 });
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
