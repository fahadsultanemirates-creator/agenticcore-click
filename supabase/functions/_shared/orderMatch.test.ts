// Tests for order recognition. Run with:
//   node --experimental-strip-types supabase/functions/_shared/orderMatch.test.ts
//
// This logic is worth testing precisely because its failure mode is silent: a
// wrong match doesn't error, it revises the wrong deliverable and reports
// success. The cases below are the real sentences clients send, not synthetic
// ones -- including the ones that must NOT resolve.

import assert from 'node:assert/strict';
import { matchOrder, productsNamedIn, findReference } from './orderMatch.ts';
import type { OrderSummary } from './orders.ts';

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

function order(publicId: string, orderNo: number, sku: number, product: string, extra: Partial<OrderSummary> = {}): OrderSummary {
  return {
    publicId,
    orderNo,
    sku,
    product,
    status: 'delivered',
    revisionsUsed: 0,
    revisionsAllowed: 1,
    createdAt: `2026-09-${String(orderNo).padStart(2, '0')}T00:00:00Z`,
    files: 1,
    ...extra
  };
}

// A typical small account, newest first (the order listAccountOrders returns).
const BOOK: OrderSummary[] = [
  order('AC-1007-04', 4, 30, 'Logo'),
  order('AC-1007-03', 3, 72, 'Letterhead'),
  order('AC-1007-02', 2, 10, 'Website — small (2–4 sections)'),
  order('AC-1007-01', 1, 62, 'One-page business plan')
];

test('an exact reference wins outright', () => {
  const match = matchOrder(BOOK, 'can you look at AC-1007-03 again');
  assert.equal(match.order?.publicId, 'AC-1007-03');
  assert.equal(match.how, 'reference');
});

test('the legacy AC-CLICK form is still recognised', () => {
  assert.equal(findReference('what happened to AC-CLICK-0042?'), 'AC-CLICK-0042');
});

test('a named product resolves without any reference', () => {
  const match = matchOrder(BOOK, 'the letterhead needs a different header');
  assert.equal(match.order?.publicId, 'AC-1007-03');
  assert.equal(match.how, 'product');
});

test('an ordinal resolves to that order number', () => {
  const match = matchOrder(BOOK, 'please redo the second one');
  assert.equal(match.order?.orderNo, 2);
  assert.equal(match.how, 'order_number');
});

test('"order 3" resolves to order number 3, not the 3rd row', () => {
  const match = matchOrder(BOOK, 'something is wrong with order 3');
  assert.equal(match.order?.publicId, 'AC-1007-03');
});

// The whole point of the candidates field: two logos and a bare "my logo"
// is a question, not a coin flip.
test('an ambiguous product asks instead of guessing', () => {
  const twoLogos = [order('AC-1007-05', 5, 30, 'Logo'), ...BOOK];
  const match = matchOrder(twoLogos, 'can you change my logo');
  assert.equal(match.order, null, 'must not pick one of two logos');
  assert.equal(match.candidates.length, 2);
});

test('"the last logo" is decidable even with two logos', () => {
  const twoLogos = [order('AC-1007-05', 5, 30, 'Logo'), ...BOOK];
  const match = matchOrder(twoLogos, 'use the last logo you made');
  assert.equal(match.order?.publicId, 'AC-1007-05');
  assert.equal(match.how, 'most_recent');
});

// A vague pronoun must never become a default. With four orders and no hint,
// the honest answer is "which one?".
test('a vague message with several orders resolves to nothing', () => {
  const match = matchOrder(BOOK, 'hey, can you fix that for me');
  assert.equal(match.order, null);
  assert.ok(match.candidates.length > 1);
});

test('a vague message resolves when there is only one order', () => {
  const match = matchOrder([BOOK[1]], 'can you fix that for me');
  assert.equal(match.order?.publicId, 'AC-1007-03');
  assert.equal(match.how, 'only_order');
});

test('"the last one" resolves to the newest order', () => {
  const match = matchOrder(BOOK, 'change the last one please');
  assert.equal(match.order?.publicId, 'AC-1007-04');
});

// Naming something they never bought must not fall through onto an
// unrelated order -- that is the wrong-file revision this file exists to stop.
// (Invoice is a real product with a real alias; this account has never
// ordered one, so the honest answer is no match at all.)
test('naming an unowned product resolves to nothing', () => {
  const match = matchOrder(BOOK, 'please fix my invoice');
  assert.equal(match.order, null, 'must not fall through to an unrelated order');
  assert.equal(match.candidates.length, 0);
});

// A word that names no product at all is different from one that names an
// unowned product: here the book itself is the list of things they might mean.
test('a word naming no product falls back to asking across the book', () => {
  const match = matchOrder(BOOK, 'please revise my video');
  assert.equal(match.order, null);
  assert.ok(match.candidates.length > 1, 'should offer the book to choose from');
});

test('an empty order book never matches', () => {
  assert.equal(matchOrder([], 'revise AC-1007-03').order, null);
});

// Specificity: "business plan" must not also drag in every product whose
// aliases merely contain "business".
test('the most specific product name wins', () => {
  const named = productsNamedIn('where is my business plan');
  assert.equal(named.size, 1, `expected one product, got ${[...named].join(', ')}`);
  assert.ok(named.has(62), `expected sku 62, got ${[...named].join(', ')}`);
});

test('a logo is recognised as the logo product, not a brand-kit item', () => {
  const named = productsNamedIn('I need a logo');
  assert.ok(named.has(30), `expected sku 30, got ${[...named].join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
