// Run with: node --experimental-strip-types supabase/functions/_shared/videoFormat.test.ts

import assert from 'node:assert/strict';
import { aspectFor, resolutionIn } from './videoFormat.ts';

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
  assert.equal(resolutionIn('a 60 second video about our services'), null);
  assert.equal(resolutionIn('10800 words'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
