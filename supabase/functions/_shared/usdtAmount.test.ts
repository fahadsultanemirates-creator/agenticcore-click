// Run with: node --experimental-strip-types supabase/functions/_shared/usdtAmount.test.ts
//
// This module decides whether somebody's money arrived. Every bug in it is
// either "a paying client is told they did not pay" or "work is given away",
// so the cases below are the ones that cost money rather than the ones that
// are easy to write.

import assert from 'node:assert/strict';
import {
  allocateNonce,
  fromUnits,
  invoiceAmount,
  matchPayment,
  toUnits,
  MAX_NONCE,
  type Transfer
} from './usdtAmount.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
  }
}

const ADDR = '0x62Ad7D55fbc8A8591109D72b67Ec63aa1EE196bC';

// ---- units ------------------------------------------------------------

// The whole scheme rests on the sixth decimal place surviving the
// conversion. At 18 decimals the naive float multiply loses it silently.
await test('18-decimal conversion keeps the digit that identifies the invoice', () => {
  assert.equal(toUnits('20.000007', 18).toString(), '20000007000000000000');
  assert.notEqual(toUnits('20.000007', 18), toUnits('20.000008', 18));
  // The float route reaches the same magnitude but not the same value: it
  // cannot represent this integer, so it cannot be compared exactly, which
  // is the entire reason for the bigint.
  assert.ok(!Number.isSafeInteger(Number('20.000007') * 1e18));
  assert.equal(toUnits('20.000007', 18) - toUnits('20.000006', 18), 10n ** 12n);
});

await test('conversion works at 6 decimals too, for a chain that uses them', () => {
  assert.equal(toUnits('20.000007', 6).toString(), '20000007');
  assert.equal(toUnits('1', 6).toString(), '1000000');
});

await test('more decimal places than the token has is refused, not truncated', () => {
  assert.throws(() => toUnits('20.0000001', 6), /decimal places/);
});

await test('a malformed amount is refused', () => {
  for (const bad of ['', 'abc', '-1', '1.2.3', ' 20', '20.']) {
    assert.throws(() => toUnits(bad, 18), new RegExp('positive decimal|decimal places'), `should reject ${JSON.stringify(bad)}`);
  }
});

await test('units convert back to a readable amount', () => {
  assert.equal(fromUnits(20_000_007_000_000_000_000n, 18), '20.000007');
  assert.equal(fromUnits(20_000_000_000_000_000_000n, 18), '20.00');
  assert.equal(fromUnits(1_500_000n, 6), '1.50');
  assert.equal(fromUnits(0n, 18), '0.00');
});

await test('round trip through units is lossless', () => {
  // fromUnits keeps at least two places, so these are already canonical.
  for (const amount of ['20.000007', '1.50', '0.01', '999.999999', '20.00']) {
    assert.equal(fromUnits(toUnits(amount, 18), 18), amount);
  }
});

// ---- invoice amounts --------------------------------------------------

await test('the nonce lands in the sixth decimal place', () => {
  assert.equal(invoiceAmount(20, 1), '20.000001');
  assert.equal(invoiceAmount(20, 7), '20.000007');
  assert.equal(invoiceAmount(20, 42), '20.000042');
  assert.equal(invoiceAmount(20, 9999), '20.009999');
});

await test('a price with cents keeps its cents', () => {
  assert.equal(invoiceAmount(1.5, 3), '1.500003');
  assert.equal(invoiceAmount(0.01, 1), '0.010001');
});

// 20.1 + 0.2 arithmetic must never reach the string a client is told to pay.
// 0.1 + 0.2 is 0.30000000000000004 and must still read as 30 cents.
await test('float drift within a cent does not reach the amount', () => {
  assert.equal(invoiceAmount(0.1 + 0.2, 1), '0.300001');
});

// 1.005 * 100 is 100.49999999999999, so rounding silently billed a cent
// less. Every real price is whole cents, so this is a fault upstream.
await test('a price that is not whole cents is refused rather than rounded', () => {
  assert.throws(() => invoiceAmount(1.005, 1), /whole number of cents/);
  assert.throws(() => invoiceAmount(0.001, 1), /whole number of cents/);
});

await test('two invoices at the same price never share an amount', () => {
  const seen = new Set<string>();
  for (let n = 1; n <= 500; n++) {
    const amount = invoiceAmount(20, n);
    assert.ok(!seen.has(amount), `${amount} allocated twice`);
    seen.add(amount);
  }
});

await test('an out-of-range nonce is refused', () => {
  assert.throws(() => invoiceAmount(20, 0), /Nonce/);
  assert.throws(() => invoiceAmount(20, MAX_NONCE + 1), /Nonce/);
  assert.throws(() => invoiceAmount(0, 1), /base price/);
});

// ---- nonce allocation -------------------------------------------------

await test('the smallest free nonce is used, so amounts stay unremarkable', () => {
  assert.equal(allocateNonce([]), 1);
  assert.equal(allocateNonce([1, 2, 3]), 4);
  assert.equal(allocateNonce([1, 3]), 2);
});

// A counter would hand out 4 again after #2 was deleted, and the reuse is
// invisible until two people pay the same amount.
await test('a freed nonce is reused rather than skipped', () => {
  assert.equal(allocateNonce([1, 3, 4]), 2);
});

// ---- matching ---------------------------------------------------------

function transfer(over: Partial<Transfer> = {}): Transfer {
  return {
    txHash: '0xaaa',
    from: '0x1111111111111111111111111111111111111111',
    to: ADDR,
    valueRaw: toUnits('20.000007', 18).toString(),
    confirmations: 20,
    blockNumber: 1000n,
    ...over
  };
}

const base = {
  expected: '20.000007',
  decimals: 18,
  receivingAddress: ADDR,
  minConfirmations: 15,
  alreadyCredited: [] as string[]
};

await test('an exact, confirmed payment is paid', () => {
  assert.deepEqual(matchPayment([transfer()], base), {
    status: 'paid',
    txHash: '0xaaa',
    from: '0x1111111111111111111111111111111111111111'
  });
});

await test('nothing at all is none', () => {
  assert.deepEqual(matchPayment([], base), { status: 'none' });
});

await test('an exact payment short of confirmations is still confirming', () => {
  assert.deepEqual(matchPayment([transfer({ confirmations: 3 })], base), {
    status: 'confirming',
    txHash: '0xaaa',
    confirmations: 3
  });
});

// The nonce is the only thing identifying the invoice, so a neighbouring
// amount must not match it.
await test('the adjacent invoice amount does not match', () => {
  const neighbour = transfer({ valueRaw: toUnits('20.000008', 18).toString() });
  const result = matchPayment([neighbour], base);
  assert.equal(result.status, 'wrong_amount');
});

await test('underpayment is reported, never credited', () => {
  const short = transfer({ valueRaw: toUnits('19.99', 18).toString() });
  assert.deepEqual(matchPayment([short], base), {
    status: 'wrong_amount',
    txHash: '0xaaa',
    received: '19.99',
    from: '0x1111111111111111111111111111111111111111'
  });
});

await test('overpayment is reported too, not silently accepted', () => {
  const over = transfer({ valueRaw: toUnits('25.00', 18).toString() });
  const result = matchPayment([over], base);
  assert.equal(result.status, 'wrong_amount');
  assert.equal(result.status === 'wrong_amount' && result.received, '25.00');
});

// The idempotency guard: a retry, a re-poll, or two sweeps overlapping must
// not credit the same money twice.
await test('an already-credited transaction is not credited again', () => {
  const result = matchPayment([transfer()], { ...base, alreadyCredited: ['0xaaa'] });
  assert.deepEqual(result, { status: 'none' });
});

await test('transaction hashes compare case-insensitively', () => {
  const result = matchPayment([transfer({ txHash: '0xAAA' })], { ...base, alreadyCredited: ['0xaaa'] });
  assert.deepEqual(result, { status: 'none' });
});

// Money sent to somebody else is not ours, whatever it says about the amount.
await test('a transfer to another address is ignored', () => {
  const elsewhere = transfer({ to: '0x0000000000000000000000000000000000000001' });
  assert.deepEqual(matchPayment([elsewhere], base), { status: 'none' });
});

// EIP-55 is a checksum, not an identity: the same address in another case
// is the same address.
await test('our address matches whatever case it is written in', () => {
  const lower = transfer({ to: ADDR.toLowerCase() });
  assert.equal(matchPayment([lower], base).status, 'paid');
  assert.equal(matchPayment([transfer()], { ...base, receivingAddress: ADDR.toLowerCase() }).status, 'paid');
});

await test('a confirmed exact payment wins over an unconfirmed one', () => {
  const result = matchPayment(
    [transfer({ txHash: '0xslow', confirmations: 1 }), transfer({ txHash: '0xdone', confirmations: 30 })],
    base
  );
  assert.equal(result.status, 'paid');
  assert.equal(result.status === 'paid' && result.txHash, '0xdone');
});

await test('an exact match wins over a wrong-amount transfer', () => {
  const result = matchPayment(
    [transfer({ txHash: '0xwrong', valueRaw: toUnits('5', 18).toString() }), transfer({ txHash: '0xright' })],
    base
  );
  assert.equal(result.status, 'paid');
  assert.equal(result.status === 'paid' && result.txHash, '0xright');
});

// A value the chain reports in a shape we cannot parse must never be read
// as a match -- that would credit an unknown amount.
await test('an unparseable value is not a match', () => {
  assert.deepEqual(matchPayment([transfer({ valueRaw: 'not-a-number' })], base), { status: 'none' });
});

await test('a zero-value transfer is not a payment', () => {
  assert.deepEqual(matchPayment([transfer({ valueRaw: '0' })], base), { status: 'none' });
});

// The decimals guard, stated as a test: reading the token as 6 decimals
// when it is 18 must not accidentally match.
await test('the wrong decimals do not accidentally match', () => {
  const at18 = transfer();
  assert.equal(matchPayment([at18], { ...base, decimals: 6 }).status, 'wrong_amount');
});

// The module is only correct if it is correct for the prices actually
// charged. invoiceAmount refuses a price that is not whole cents, so this
// is the check that the refusal can never fire in production -- and the one
// that notices if a price like $0.005 is ever added.
await test('every price the catalog can charge produces a valid amount', async () => {
  const pricing = await import('./pricing.ts');
  const prices = [
    pricing.calculatePriceUsd('website', { tier: 'small' }),
    pricing.calculatePriceUsd('website', { tier: 'large' }),
    pricing.calculatePriceUsd('pdf', {}),
    pricing.calculatePriceUsd('social', {}),
    pricing.calculatePriceUsd('documents', {}),
    pricing.calculatePriceUsd('brand-kit', {}),
    pricing.calculatePriceUsd('image', {}),
    pricing.calculatePriceUsd('video', { resolution: '720p' }),
    pricing.calculatePriceUsd('video', { resolution: '1080p' }),
    pricing.FULL_BUSINESS_SETUP_USD,
    pricing.BUSINESS_REPORT_USD
  ];

  for (const price of prices) {
    assert.ok(price !== null, 'a priced product returned null');
    const amount = invoiceAmount(price as number, 1);
    // It must survive the round trip the chain will put it through.
    assert.equal(fromUnits(toUnits(amount, 18), 18), amount);
    // And the surcharge must stay under a cent, or clients notice.
    assert.ok(Number(amount) - (price as number) < 0.01, `${amount} is more than a cent over ${price}`);
  }
});

// The hole that is not the obvious one. Two OPEN invoices can never share
// an amount -- Postgres enforces that. But a closed invoice frees its
// amount, nonces are reissued smallest-first, and a slow payment for the
// old invoice then lands while the new one is open.
await test('a transfer mined before the invoice existed cannot settle it', () => {
  const alicePaidLate = transfer({ blockNumber: 900n });
  assert.deepEqual(matchPayment([alicePaidLate], { ...base, minBlock: 1000n }), { status: 'none' });
});

await test('a transfer mined at or after the invoice settles it', () => {
  assert.equal(matchPayment([transfer({ blockNumber: 1000n })], { ...base, minBlock: 1000n }).status, 'paid');
  assert.equal(matchPayment([transfer({ blockNumber: 1001n })], { ...base, minBlock: 1000n }).status, 'paid');
});

// Invoices opened before the bound existed have no from_block, and must
// keep working rather than silently never matching.
await test('no bound means no bound, not nothing matches', () => {
  assert.equal(matchPayment([transfer({ blockNumber: 1n })], { ...base, minBlock: null }).status, 'paid');
  assert.equal(matchPayment([transfer({ blockNumber: 1n })], base).status, 'paid');
});

// The bound applies before the wrong-amount report too, or an old payment
// would raise a false alarm against a stranger's invoice.
await test('an out-of-window transfer is not even reported as wrong', () => {
  const old = transfer({ blockNumber: 900n, valueRaw: toUnits('19.99', 18).toString() });
  assert.deepEqual(matchPayment([old], { ...base, minBlock: 1000n }), { status: 'none' });
});

// Who paid comes off the log, so support can answer "where did my money
// go" without anyone having been asked to paste an address.
await test('the paying address is carried through', () => {
  const result = matchPayment([transfer({ from: '0xDEAD' })], base);
  assert.equal(result.status === 'paid' && result.from, '0xDEAD');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
