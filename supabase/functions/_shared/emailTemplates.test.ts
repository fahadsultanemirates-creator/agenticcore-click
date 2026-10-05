// Run with: node --experimental-strip-types supabase/functions/_shared/emailTemplates.test.ts

import assert from 'node:assert/strict';
import {
  escapeHtml,
  formatUsd,
  orderDeliveredEmail,
  orderPlacedEmail,
  topUpEmail,
  welcomeEmail,
} from './emailTemplates.ts';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${(name)}\n      ${(err as Error).message}`);
  }
}

const ALL = [
  welcomeEmail(),
  orderPlacedEmail({ publicId: 'AC-1007-03', productName: 'Website — small (1–4 pages)', priceUsd: 10 }),
  orderDeliveredEmail({ publicId: 'AC-1007-03', productName: 'Website — small (1–4 pages)' }),
  topUpEmail({ amountUsd: 30, balanceUsd: 42.5 }),
];

test('every email has a subject, an html body and a text body', () => {
  for (const email of ALL) {
    assert.ok(email.subject.length > 0, 'empty subject');
    assert.ok(email.html.includes('<!doctype html>'), 'html is not a document');
    assert.ok(email.text.length > 0, 'empty text part');
  }
});

// A subject that wraps is a subject nobody reads past. Mail clients cut
// around 70 characters on a phone.
test('no subject line is long enough to be truncated', () => {
  for (const email of ALL) {
    assert.ok(email.subject.length <= 70, `too long (${email.subject.length}): ${email.subject}`);
  }
});

test('both parts of an email carry the same reference', () => {
  for (const email of [ALL[1], ALL[2]]) {
    assert.ok(email.html.includes('AC-1007-03'), 'reference missing from html');
    assert.ok(email.text.includes('AC-1007-03'), 'reference missing from text');
  }
});

// Someone has to be able to answer a delivery email. A transactional mail
// with no way back is how a complaint becomes a chargeback.
test('every email says how to reach a human', () => {
  for (const email of ALL) {
    assert.ok(email.html.includes('hello@agenticcore.click'), 'no support address in html');
  }
});

test('money is always two decimal places', () => {
  assert.equal(formatUsd(20), '$20.00');
  assert.equal(formatUsd(20.5), '$20.50');
  assert.equal(formatUsd(0), '$0.00');
  const email = topUpEmail({ amountUsd: 30, balanceUsd: 42.5 });
  assert.ok(email.text.includes('$30.00'));
  assert.ok(email.text.includes('$42.50'));
});

test('a price is stated identically in both parts', () => {
  const email = orderPlacedEmail({ publicId: 'AC-1007-04', productName: 'Logo', priceUsd: 1 });
  assert.ok(email.html.includes('$1.00'));
  assert.ok(email.text.includes('$1.00'));
});

// A business name is whatever the client typed. Angle brackets in one must
// not reach the recipient's mail client as markup.
test('a product name cannot inject html', () => {
  const email = orderPlacedEmail({
    publicId: 'AC-1007-05',
    productName: '<script>alert(1)</script>',
    priceUsd: 3,
  });
  assert.ok(!email.html.includes('<script>'), 'script tag survived into the html');
  assert.ok(email.html.includes('&lt;script&gt;'), 'name was dropped instead of escaped');
});

test('a quote or apostrophe survives as itself, not as broken markup', () => {
  assert.equal(escapeHtml(`Bob's "Café"`), 'Bob&#39;s &quot;Café&quot;');
  const email = orderDeliveredEmail({ publicId: 'AC-1007-06', productName: `Bob's flyer` });
  assert.ok(email.html.includes('Bob&#39;s flyer'));
  // The text part is not html and must not be escaped into gibberish.
  assert.ok(email.text.includes("Bob's flyer"));
});

test('the subject of a delivery names the product, so an inbox is scannable', () => {
  const email = orderDeliveredEmail({ publicId: 'AC-1007-07', productName: 'Brand style guide' });
  assert.ok(email.subject.includes('Brand style guide'));
  assert.ok(email.subject.includes('AC-1007-07'));
});

test('the welcome email points at both the dashboard and the bot', () => {
  const email = welcomeEmail();
  assert.ok(email.text.includes('agenticcore.click/dashboard'));
  assert.ok(email.text.includes('t.me/AgenticcoreClickManagerbot'));
  assert.ok(email.html.includes('t.me/AgenticcoreClickManagerbot'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
