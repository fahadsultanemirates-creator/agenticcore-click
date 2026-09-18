// Run with: node --experimental-strip-types supabase/functions/_shared/heygenFields.test.ts

import assert from 'node:assert/strict';
import { previewAudioUrl } from './heygenFields.ts';

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

test('the documented name is found', () => {
  assert.equal(previewAudioUrl({ preview_audio_url: 'https://x/a.mp3' }), 'https://x/a.mp3');
});

// The live shape: the key we had hard-coded does not exist.
test('a differently named audio field is still found', () => {
  assert.equal(previewAudioUrl({ voice_id: 'v1', name: 'Cerys', preview_audio: 'https://x/b.mp3' }), 'https://x/b.mp3');
  assert.equal(previewAudioUrl({ sample_url: 'https://x/c.wav' }), 'https://x/c.wav');
});

// A voice record carrying an avatar-ish image must never be sent as audio.
test('an audio key beats a generic preview key', () => {
  const voice = { preview_image_url: 'https://x/pic.png', preview_audio: 'https://x/a.mp3' };
  assert.equal(previewAudioUrl(voice), 'https://x/a.mp3');
});

test('a non-url value is never returned', () => {
  assert.equal(previewAudioUrl({ preview_audio: 'none' }), null);
  assert.equal(previewAudioUrl({ audio_enabled: true as unknown as string }), null);
});

test('nothing audio-ish returns null rather than a wrong link', () => {
  assert.equal(previewAudioUrl({ voice_id: 'v1', name: 'Cerys', avatar_url: 'https://x/pic.png' }), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
