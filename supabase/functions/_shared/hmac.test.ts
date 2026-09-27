// Run with: node --experimental-strip-types supabase/functions/_shared/hmac.test.ts
//
// Grok Bot holds no database credentials, so this signature is the entire
// boundary. Every test here is a way in that must stay shut.

import assert from 'node:assert/strict';
import { sign, verify } from './hmac.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const SECRET = 'a-shared-secret';
const NOW = 1_800_000_000_000;
const TS = String(Math.floor(NOW / 1000));

await test('a signature we produced verifies', async () => {
  const body = JSON.stringify({ action: 'accept', job: 'abc' });
  const signature = await sign(SECRET, TS, body);
  assert.deepEqual(await verify(SECRET, TS, signature, body, NOW), { ok: true });
});

await test('a changed body fails', async () => {
  const signature = await sign(SECRET, TS, '{"amount":10}');
  const result = await verify(SECRET, TS, signature, '{"amount":1000}', NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'mismatch');
});

await test('another secret fails', async () => {
  const body = '{"action":"submit"}';
  const signature = await sign('someone-elses-secret', TS, body);
  assert.equal((await verify(SECRET, TS, signature, body, NOW)).ok, false);
});

// The reason the timestamp is signed at all: without it, a single captured
// callback could be replayed to re-deliver or re-fail a task indefinitely.
await test('a valid signature from an hour ago is refused', async () => {
  const oldTs = String(Math.floor(NOW / 1000) - 3600);
  const body = '{"action":"failed"}';
  const signature = await sign(SECRET, oldTs, body);
  const result = await verify(SECRET, oldTs, signature, body, NOW);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stale');
});

await test('clock skew of a couple of minutes is tolerated', async () => {
  const skewed = String(Math.floor(NOW / 1000) - 120);
  const body = '{"action":"progress"}';
  const signature = await sign(SECRET, skewed, body);
  assert.equal((await verify(SECRET, skewed, signature, body, NOW)).ok, true);
});

await test('a timestamp from the future is refused too', async () => {
  const ahead = String(Math.floor(NOW / 1000) + 3600);
  const body = '{"action":"accept"}';
  const signature = await sign(SECRET, ahead, body);
  assert.equal((await verify(SECRET, ahead, signature, body, NOW)).ok, false);
});

await test('no signature at all is refused, not ignored', async () => {
  assert.equal((await verify(SECRET, TS, null, '{}', NOW)).ok, false);
  assert.equal((await verify(SECRET, null, 'deadbeef', '{}', NOW)).ok, false);
  assert.equal((await verify(SECRET, 'not-a-number', 'deadbeef', '{}', NOW)).ok, false);
});

// Signing the body alone would make every signature reusable; signing the
// timestamp alone would let the body be swapped under a good signature.
await test('the timestamp is part of what is signed', async () => {
  const body = '{"action":"accept"}';
  const signature = await sign(SECRET, TS, body);
  const otherTs = String(Number(TS) - 60);
  assert.equal((await verify(SECRET, otherTs, signature, body, NOW)).ok, false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
