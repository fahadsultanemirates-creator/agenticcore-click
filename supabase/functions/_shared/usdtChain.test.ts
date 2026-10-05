// Run with: node --experimental-strip-types supabase/functions/_shared/usdtChain.test.ts
//
// The network parts are not tested here (they need a key and a live chain).
// What IS tested is the decoding either side of the network, because both
// are easy to get subtly wrong and both decide whether money is credited.

import assert from 'node:assert/strict';
import { decodeStringResult, refusalReason, toTransfer } from './usdtChain.ts';

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

// An ABI string return: a 32-byte offset, a 32-byte length, then the bytes
// right-padded to a 32-byte boundary.
function encodeString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const offset = (32).toString(16).padStart(64, '0');
  const length = bytes.length.toString(16).padStart(64, '0');
  const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
  return '0x' + offset + length + padded;
}

test('a symbol decodes out of an ABI string return', () => {
  assert.equal(decodeStringResult(encodeString('USDT')), 'USDT');
  assert.equal(decodeStringResult(encodeString('BSC-USD')), 'BSC-USD');
});

// This is the guard against a lookalike token, so it has to fail closed:
// anything it cannot read must come back empty and be rejected, never
// read as a match for an expected symbol.
test('anything unreadable decodes to empty rather than to a guess', () => {
  assert.equal(decodeStringResult(''), '');
  assert.equal(decodeStringResult('0x'), '');
  assert.equal(decodeStringResult('0x' + '0'.repeat(64)), '');
  // A length that claims more bytes than are present.
  assert.equal(decodeStringResult('0x' + (32).toString(16).padStart(64, '0') + (99).toString(16).padStart(64, '0') + 'ab'), '');
});

test('trailing padding is not part of the symbol', () => {
  assert.equal(decodeStringResult(encodeString('USDT')).length, 4);
});

// ---- transfer rows ----------------------------------------------------

const ROW = {
  hash: '0xabc',
  to: '0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC',
  value: '20000007000000000000',
  confirmations: '42'
};

test('a well-formed row becomes a transfer', () => {
  assert.deepEqual(toTransfer(ROW), {
    txHash: '0xabc',
    to: '0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC',
    valueRaw: '20000007000000000000',
    confirmations: 42
  });
});

test('a row missing anything that identifies it is dropped', () => {
  for (const key of ['hash', 'to', 'value']) {
    const row: Record<string, unknown> = { ...ROW };
    delete row[key];
    assert.equal(toTransfer(row), null, `should drop a row with no ${key}`);
  }
});

// Defaulting the other way would credit a transfer one block deep.
test('missing or junk confirmations count as zero, not as plenty', () => {
  assert.equal(toTransfer({ ...ROW, confirmations: undefined })?.confirmations, 0);
  assert.equal(toTransfer({ ...ROW, confirmations: 'soon' })?.confirmations, 0);
  assert.equal(toTransfer({ ...ROW, confirmations: '-5' })?.confirmations, 0);
});

test('a fractional confirmation count rounds down', () => {
  assert.equal(toTransfer({ ...ROW, confirmations: '15.9' })?.confirmations, 15);
});

// The value stays a string all the way to the matcher, which parses it as
// a bigint. Turning it into a Number here would lose the low digits that
// identify the invoice.
test('the value is carried as a string, never as a number', () => {
  const t = toTransfer(ROW);
  assert.equal(typeof t?.valueRaw, 'string');
  assert.equal(t?.valueRaw, '20000007000000000000');
});

// An explorer refusing the key answers with HTTP 200 and a body shaped
// exactly like a real reply. Reading that as an answer is what produced
// "Could not read decimals()" on the first live check, which pointed at
// the contract when the fault was the key.
test('a refusal is recognised rather than read as an answer', () => {
  assert.ok(refusalReason({ status: '0', message: 'NOTOK', result: 'Invalid API Key' }));
  assert.ok(refusalReason({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' }));
  // The live failure: status 0, NOTOK, and nothing else to go on. Matching
  // known phrases missed this, so the next host was never tried.
  assert.ok(refusalReason({ status: '0', message: 'NOTOK' }));
  assert.ok(refusalReason({ status: '0', message: 'NOTOK', result: '' }));
});

// The reason is what the caller needs, and it lives in `result`, not in
// `message`. Reporting `message` alone gave "NOTOK" twice running.
test('the refusal carries the reason, not just NOTOK', () => {
  const reason = refusalReason({ status: '0', message: 'NOTOK', result: 'Invalid API Key' });
  assert.match(reason ?? '', /Invalid API Key/);
});

test('a real answer is not mistaken for a refusal', () => {
  assert.equal(refusalReason({ jsonrpc: '2.0', id: 1, result: '0x12' }), null);
  assert.equal(refusalReason({ status: '1', message: 'OK', result: [] }), null);
  assert.equal(refusalReason({}), null);
});

// An address with no transfers yet answers status "0" as well. That is a
// true answer; calling it a refusal would send every quiet sweep round
// all three hosts and report an outage.
test('an empty address is an answer, not a refusal', () => {
  assert.equal(refusalReason({ status: '0', message: 'No transactions found', result: [] }), null);
  assert.equal(refusalReason({ status: '0', message: 'NOTOK', result: 'No transactions found' }), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
