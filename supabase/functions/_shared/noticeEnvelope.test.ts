// Run with: node --experimental-strip-types supabase/functions/_shared/noticeEnvelope.test.ts

import assert from 'node:assert/strict';
import { sealNotice } from './noticeEnvelope.ts';
import { canonicalJson } from './canonicalJson.ts';
import { sign } from './hmac.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const SECRET = 'test-callback-secret';

const NOTICE = {
  type: 'task',
  job: { id: 'job-1', token: 'tok-1', acceptBy: '2026-09-28T20:06:13Z' },
  task: { reference: 'AC-1001-02', sku: 52, product: 'Caption & hashtag pack', brief: 'Ten captions' },
  callback: 'https://example.test/functions/v1/grokbot-callback'
};

// Grok Bot's side, written independently of how we build the envelope: take
// the payload off the body, canonicalise it, recompute. If this passes, the
// two implementations agree.
async function verifyAsRecipient(body: { payload: unknown; ts: number; sig: string }, secret: string): Promise<boolean> {
  const expected = await sign(secret, String(body.ts), canonicalJson(body.payload));
  return expected === body.sig;
}

await test('a sealed notice verifies at the other end', async () => {
  const sealed = await sealNotice(SECRET, NOTICE);
  assert.ok(await verifyAsRecipient(sealed, SECRET), 'recipient must accept a good signature');
});

await test('the envelope is exactly {payload, ts, sig}', async () => {
  const sealed = await sealNotice(SECRET, NOTICE);
  assert.deepEqual(Object.keys(sealed).sort(), ['payload', 'sig', 'ts']);
  assert.equal(typeof sealed.ts, 'number', 'ts is unix seconds, not a string');
  assert.match(sealed.sig, /^[0-9a-f]{64}$/, 'sig is lowercase hex SHA-256');
  assert.deepEqual(sealed.payload, NOTICE, 'the payload travels unaltered');
});

// The whole point: a relay that rewrites the body cannot go unnoticed.
await test('a tampered payload is rejected', async () => {
  const sealed = await sealNotice(SECRET, NOTICE);
  const tampered = {
    ...sealed,
    payload: { ...NOTICE, task: { ...NOTICE.task, reference: 'AC-9999-99' } }
  };
  assert.equal(await verifyAsRecipient(tampered, SECRET), false);
});

await test('a swapped signature is rejected', async () => {
  const a = await sealNotice(SECRET, NOTICE);
  const b = await sealNotice(SECRET, { ...NOTICE, type: 'cancelled' });
  assert.equal(await verifyAsRecipient({ ...a, sig: b.sig }, SECRET), false);
});

await test('a shifted timestamp is rejected', async () => {
  const sealed = await sealNotice(SECRET, NOTICE);
  assert.equal(await verifyAsRecipient({ ...sealed, ts: sealed.ts + 1 }, SECRET), false);
});

// The secret is the thing being proven. Signing with the wrong one -- the
// outbound webhook key, say -- must not verify, which is exactly the bug
// this change exists to avoid shipping.
await test('the wrong secret does not verify', async () => {
  const sealed = await sealNotice('grokbot-webhook-key', NOTICE);
  assert.equal(await verifyAsRecipient(sealed, SECRET), false);
});

// Key order is an implementation detail on both sides; it must not be part
// of the security contract.
await test('key order in the payload does not change the signature', async () => {
  const at = Date.now();
  const forward = await sealNotice(SECRET, { a: 1, b: { c: 2, d: 3 } }, at);
  const reversed = await sealNotice(SECRET, { b: { d: 3, c: 2 }, a: 1 }, at);
  assert.equal(forward.sig, reversed.sig);
});

await test('ts is whole unix seconds', async () => {
  const sealed = await sealNotice(SECRET, NOTICE, 1_759_000_000_789);
  assert.equal(sealed.ts, 1_759_000_000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
