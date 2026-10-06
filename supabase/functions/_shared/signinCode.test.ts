// Run with: node --experimental-strip-types supabase/functions/_shared/signinCode.test.ts

import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeState,
  daysLeft,
  expiryFrom,
  formatCode,
  generateCode,
  hashCode,
  normaliseCode,
  timingSafeEqual,
} from './signinCode.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  const done = (err?: unknown) => {
    if (err) {
      failed++;
      console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
    } else {
      passed++;
      console.log(`PASS  ${name}`);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(result.then(() => done()).catch(done));
    } else {
      done();
    }
  } catch (err) {
    done(err);
  }
}

const pending: Promise<void>[] = [];

test('a generated code is the advertised shape', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/, code);
    for (const char of code.replace('-', '')) {
      assert.ok(CODE_ALPHABET.includes(char), `${char} is not in the alphabet`);
    }
  }
});

// The whole point of the alphabet. A code containing an O is a support
// ticket from someone who typed a zero.
test('the lookalike characters never appear', () => {
  const codes = Array.from({ length: 400 }, () => generateCode()).join('');
  for (const banned of ['I', 'O', 'S', 'Z', '0', '1', '5']) {
    assert.ok(!codes.includes(banned), `${banned} was generated`);
  }
});

test('codes are not all the same code', () => {
  const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
  assert.ok(seen.size > 190, `only ${seen.size} distinct codes in 200`);
});

// Rejection sampling exists so no letter is likelier than another. With a
// biased modulo the first few letters of the alphabet appear noticeably
// more often; this catches that regression.
test('no character is systematically favoured', () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 3000; i++) {
    for (const char of generateCode().replace('-', '')) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  const expected = (3000 * CODE_LENGTH) / CODE_ALPHABET.length;
  for (const [char, count] of counts) {
    assert.ok(
      count > expected * 0.7 && count < expected * 1.3,
      `${char} appeared ${count} times, expected around ${Math.round(expected)}`
    );
  }
});

test('however someone types it back, it is the same code', () => {
  const variants = ['AB3F-KM79', 'ab3f-km79', 'AB3FKM79', ' AB3F-KM79 ', 'AB3F KM79', '"ab3fkm79"'];
  for (const variant of variants) {
    assert.equal(normaliseCode(variant), 'AB3FKM79', variant);
  }
});

test('something that could not be one of our codes is refused', () => {
  assert.equal(normaliseCode('AB3F-KM7'), null, 'too short');
  assert.equal(normaliseCode('AB3F-KM790'), null, 'too long');
  assert.equal(normaliseCode('AB3F-KM7O'), null, 'contains a letter O');
  assert.equal(normaliseCode('AB3F-KM71'), null, 'contains a digit 1');
  assert.equal(normaliseCode(''), null);
});

test('a generated code round-trips through normalise', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateCode();
    assert.equal(normaliseCode(code), code.replace('-', ''));
  }
});

test('formatting is display only and idempotent', () => {
  assert.equal(formatCode('AB3FKM79'), 'AB3F-KM79');
  assert.equal(formatCode('AB3F-KM79'), 'AB3F-KM79');
});

test('the same code always hashes the same, different codes do not collide', async () => {
  const a = await hashCode('AB3FKM79');
  const b = await hashCode('AB3FKM79');
  const c = await hashCode('AB3FKM78');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

// The hyphen is display sugar. If it reached the hash, a client who typed
// their code without it could never sign in.
test('the hyphen never reaches the hash', async () => {
  const withHyphen = await hashCode(normaliseCode('AB3F-KM79')!);
  const without = await hashCode(normaliseCode('AB3FKM79')!);
  assert.equal(withHyphen, without);
});

test('a code lasts the 30 days the client was told', () => {
  const issued = new Date('2026-01-01T00:00:00Z');
  assert.equal(expiryFrom(issued).toISOString(), '2026-01-31T00:00:00.000Z');
});

test('a code is valid until its expiry, then not', () => {
  const expiresAt = '2026-02-01T00:00:00Z';
  assert.equal(codeState({ usedAt: null, expiresAt }, new Date('2026-01-20T00:00:00Z')), 'valid');
  assert.equal(codeState({ usedAt: null, expiresAt }, new Date('2026-01-31T23:59:59Z')), 'valid');
  assert.equal(codeState({ usedAt: null, expiresAt }, new Date('2026-02-01T00:00:00Z')), 'expired');
  assert.equal(codeState({ usedAt: null, expiresAt }, new Date('2026-03-01T00:00:00Z')), 'expired');
});

// Someone who already set their password and tries the old code should
// hear "already used", not "expired" -- the second sends a working
// account to support.
test('a used code reads as used even long after it expired', () => {
  const state = codeState(
    { usedAt: '2026-01-10T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z' },
    new Date('2026-06-01T00:00:00Z')
  );
  assert.equal(state, 'used');
});

test('days left counts whole days and never goes negative', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(daysLeft('2026-01-31T00:00:00Z', now), 30);
  assert.equal(daysLeft('2026-01-02T12:00:00Z', now), 1);
  assert.equal(daysLeft('2026-01-01T00:00:01Z', now), 0);
  assert.equal(daysLeft('2025-12-01T00:00:00Z', now), 0);
});

test('timing-safe comparison still compares', () => {
  assert.ok(timingSafeEqual('abc', 'abc'));
  assert.ok(!timingSafeEqual('abc', 'abd'));
  assert.ok(!timingSafeEqual('abc', 'abcd'));
  assert.ok(!timingSafeEqual('', 'a'));
  assert.ok(timingSafeEqual('', ''));
});

await Promise.all(pending);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
