// Run with: node --experimental-strip-types supabase/functions/_shared/usdtChain.test.ts
//
// The network calls are not tested here. The decoding either side of them
// is, because both decide whether somebody's money is credited.

import assert from 'node:assert/strict';
import {
  chunkRanges,
  decodeStringResult,
  looksLikeHttpUrl,
  lookbackBlocks,
  safeHost,
  scanStart,
  toLogTransfer,
  INVOICE_MINUTES,
  MAX_RANGE_BLOCKS
} from './usdtChain.ts';

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


// ---- the scan window --------------------------------------------------
//
// This is the bug .agency hit with real money in it, and .click had the
// same shape. The window was a hard-coded 1500 blocks, commented as
// "~75 minutes at BNB's three-second blocks" and "comfortably past the
// sixty-minute invoice window". Both halves went stale: BNB mines at
// about 0.75 seconds since Lorentz, so 1500 blocks is under twenty
// minutes, and an invoice payable for an hour was being matched against a
// twenty-minute window. A payment that landed later was never looked at.
//
// The number is derived now. These tests are what stop it rotting again.

test('the window covers the whole invoice, even at double the block speed', () => {
  // The guarantee, stated as arithmetic rather than as a comment: however
  // fast the chain is mined, the lookback must still span an invoice's
  // entire payable life.
  const fastestPlausibleSeconds = 0.5;
  const blocksInAnInvoiceWindow = (INVOICE_MINUTES * 60) / fastestPlausibleSeconds;
  assert.ok(
    lookbackBlocks() >= blocksInAnInvoiceWindow,
    `${lookbackBlocks()} blocks does not cover ${blocksInAnInvoiceWindow}`
  );
});

test('the old 1500 would now fail that guarantee', () => {
  // The regression, pinned. If someone reinstates a fixed window this is
  // the test that argues with them.
  assert.ok(1500 < (INVOICE_MINUTES * 60) / 0.75, '1500 blocks is under an hour at 0.75s');
  assert.ok(lookbackBlocks() > 1500);
});

test('the oldest open invoice narrows the scan', () => {
  // A fresh invoice means a scan of minutes, not of the whole window --
  // which is most of why this stays inside what a free node will serve.
  const head = 60_000_000n;
  assert.equal(scanStart({ oldestPendingBlock: head - 80n, head }), head - 80n);
  assert.equal(chunkRanges(scanStart({ oldestPendingBlock: head - 80n, head }), head).length, 1);
});

test('an invoice older than the window does not cause an unbounded scan', () => {
  // It has expired anyway, and honouring it would mean scanning forever.
  const head = 60_000_000n;
  assert.equal(scanStart({ oldestPendingBlock: 1n, head }), head - BigInt(lookbackBlocks()));
});

test('with nothing pending it falls back to the full window', () => {
  const head = 60_000_000n;
  assert.equal(scanStart({ oldestPendingBlock: null, head }), head - BigInt(lookbackBlocks()));
});

// There is no cursor here -- every sweep re-reads the window -- so a scan
// that stops before the head would never see a new payment. The ceiling
// clamps where the scan STARTS, never how far it goes.
test('every scan reaches the chain head', () => {
  const head = 60_000_000n;
  for (const oldest of [null, 1n, head - 10_000n, head - 80n, head]) {
    const ranges = chunkRanges(scanStart({ oldestPendingBlock: oldest, head }), head);
    assert.ok(ranges.length > 0, 'a scan with no ranges reads nothing');
    assert.equal(ranges[ranges.length - 1].to, head, `last range stopped at ${ranges[ranges.length - 1].to}`);
  }
});

test('chunks abut exactly -- no block scanned twice, none skipped', () => {
  const ranges = chunkRanges(0n, 2500n, 1000);
  assert.deepEqual(ranges, [
    { from: 0n, to: 999n },
    { from: 1000n, to: 1999n },
    { from: 2000n, to: 2500n }
  ]);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].from, ranges[i - 1].to + 1n);
});

test('no chunk is wider than a node will serve', () => {
  for (const r of chunkRanges(0n, 10_000n)) {
    assert.ok(r.to - r.from + 1n <= BigInt(MAX_RANGE_BLOCKS));
  }
});

// ---- never publish the RPC key ----------------------------------------

test('a keyed endpoint is reduced to its origin', () => {
  assert.equal(safeHost('https://bsc-mainnet.nodereal.io/v1/abc123def'), 'https://bsc-mainnet.nodereal.io');
  assert.equal(safeHost('https://example.org/rpc?apikey=sekret'), 'https://example.org');
  assert.equal(safeHost('https://user:pass@example.org/rpc'), 'https://example.org');
});

test('a bare API key is never echoed back, and is not a usable host', () => {
  assert.equal(safeHost('abc123def456'), '<malformed BSC_RPC_URL>');
  assert.equal(looksLikeHttpUrl('abc123def456'), false);
  assert.equal(looksLikeHttpUrl('bsc-mainnet.nodereal.io/v1/abc'), false, 'no scheme is not a URL');
  assert.equal(looksLikeHttpUrl('https://bsc-mainnet.nodereal.io/v1/abc'), true);
});

test('a plain public host stays readable', () => {
  // Redaction must not cost the diagnostics that made the node failures
  // legible in the first place.
  assert.equal(safeHost('https://bsc.drpc.org'), 'https://bsc.drpc.org');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
