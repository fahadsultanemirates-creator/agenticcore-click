// Run with: node --experimental-strip-types supabase/functions/_shared/usdtChain.test.ts
//
// The network calls are not tested here. The decoding either side of them
// is, because both decide whether somebody's money is credited.

import assert from 'node:assert/strict';
import { decodeStringResult, toLogTransfer } from './usdtChain.ts';

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

// ---- symbol(), as an ABI string return -------------------------------

function encodeString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const offset = (32).toString(16).padStart(64, '0');
  const length = bytes.length.toString(16).padStart(64, '0');
  return '0x' + offset + length + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
}

test('a symbol decodes out of an ABI string return', () => {
  assert.equal(decodeStringResult(encodeString('USDT')), 'USDT');
  assert.equal(decodeStringResult(encodeString('BSC-USD')), 'BSC-USD');
});

// This guards against a lookalike token, so it has to fail closed:
// anything unreadable must come back empty and be rejected.
test('anything unreadable decodes to empty rather than to a guess', () => {
  assert.equal(decodeStringResult(''), '');
  assert.equal(decodeStringResult('0x'), '');
  assert.equal(decodeStringResult('0x' + '0'.repeat(64)), '');
  assert.equal(
    decodeStringResult('0x' + (32).toString(16).padStart(64, '0') + (99).toString(16).padStart(64, '0') + 'ab'),
    ''
  );
});

test('trailing padding is not part of the symbol', () => {
  assert.equal(decodeStringResult(encodeString('USDT')).length, 4);
});

// ---- Transfer logs ---------------------------------------------------

const US = '0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topic(address: string): string {
  return '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function log(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionHash: '0xabc',
    // 20.000007 at 18 decimals.
    data: '0x0000000000000000000000000000000000000000000000011590f0e8f2b3c000',
    topics: [TRANSFER, topic('0x1111111111111111111111111111111111111111'), topic(US)],
    blockNumber: '0x64',
    ...over
  };
}

test('a log becomes a transfer', () => {
  const t = toLogTransfer(log(), 0x64n + 41n);
  assert.equal(t?.txHash, '0xabc');
  assert.equal(t?.to.toLowerCase(), US.toLowerCase());
  assert.equal(t?.confirmations, 42);
});

// The value is carried as a decimal string and compared as a bigint. A
// Number here would lose the digits that identify the invoice.
test('the value is decoded exactly, as a string', () => {
  const t = toLogTransfer(log({ data: '0x' + (20_000_007_000_000_000_000n).toString(16) }), 200n);
  assert.equal(typeof t?.valueRaw, 'string');
  assert.equal(t?.valueRaw, '20000007000000000000');
});

test('the block just mined counts as one confirmation', () => {
  assert.equal(toLogTransfer(log({ blockNumber: '0x64' }), 0x64n)?.confirmations, 1);
});

// Defaulting the other way would credit a payment that is not yet settled.
test('a block ahead of the head counts as zero, not as plenty', () => {
  assert.equal(toLogTransfer(log({ blockNumber: '0xc8' }), 0x64n)?.confirmations, 0);
});

test('a log missing anything that identifies it is dropped', () => {
  for (const key of ['transactionHash', 'data', 'topics', 'blockNumber']) {
    const row = log();
    delete row[key];
    assert.equal(toLogTransfer(row, 200n), null, `should drop a log with no ${key}`);
  }
});

test('a log with too few topics is dropped', () => {
  assert.equal(toLogTransfer(log({ topics: [TRANSFER] }), 200n), null);
});

test('an unparseable value or block is dropped, not guessed at', () => {
  assert.equal(toLogTransfer(log({ data: 'not-hex' }), 200n), null);
  assert.equal(toLogTransfer(log({ blockNumber: 'soon' }), 200n), null);
});

// Topics are 32 bytes; an address is the last 20. Taking the wrong end
// would make every transfer look like it went somewhere else.
test('the recipient is read off the end of the topic', () => {
  const t = toLogTransfer(log(), 200n);
  assert.equal(t?.to.length, 42);
  assert.equal(t?.to.toLowerCase(), US.toLowerCase());
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
