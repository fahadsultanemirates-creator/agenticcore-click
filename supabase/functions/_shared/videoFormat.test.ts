// Run with: node --experimental-strip-types supabase/functions/_shared/videoFormat.test.ts

import assert from 'node:assert/strict';
import { aspectFor } from './videoFormat.ts';

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

// The original bug: a clip ordered landscape came back 720x1280 portrait
// with white bands down both sides. The pixel arithmetic that caused it is
// gone -- grok-imagine-video takes the ratio as a string -- but the
// behaviour it got wrong still has to hold.
test('video is landscape unless the order asks otherwise', () => {
  assert.equal(aspectFor({}), '16:9');
  assert.equal(aspectFor({ resolution: '720p' }), '16:9');
  assert.equal(aspectFor({ resolution: '1080p' }), '16:9');
});

test('vertical is honoured when asked for, either spelling', () => {
  assert.equal(aspectFor({ aspect: '9:16' }), '9:16');
  assert.equal(aspectFor({ orientation: 'portrait' }), '9:16');
});

// Resolution and orientation are separate choices; one must not move the
// other, which is exactly what the transposed-dimension bug did.
test('resolution does not change orientation', () => {
  assert.equal(aspectFor({ aspect: '9:16', resolution: '1080p' }), '9:16');
  assert.equal(aspectFor({ aspect: '9:16', resolution: '720p' }), '9:16');
  assert.equal(aspectFor({ orientation: 'landscape', resolution: '720p' }), '16:9');
});

// resolutionIn and its tests are gone with it. It read a quality out of
// the words of a brief, from when resolution was a priced tier. Every
// clip is 1080p at one price now, so the only thing honouring "make it
// 720p" could do is charge full price for a worse clip.

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
