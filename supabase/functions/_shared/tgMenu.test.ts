// Run with: node --experimental-strip-types supabase/functions/_shared/tgMenu.test.ts

import assert from 'node:assert/strict';
import { CATALOG, type CatalogItem } from './catalog.ts';
import { calculatePriceUsd } from './pricing.ts';
import { WALLET_PACKAGES } from './orderOffer.ts';
import {
  CATEGORIES,
  invoiceIssuedScreen,
  justSignedUpScreen,
  CLIENT_COMMANDS,
  MAX_CALLBACK_BYTES,
  categoriesScreen,
  categoryScreen,
  confirmScreen,
  decode,
  encode,
  homeScreen,
  walletScreen,
  type Keyboard,
} from './tgMenu.ts';

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

const priceOf = (item: CatalogItem) => calculatePriceUsd(item.service, item.selector);
const sellable = CATALOG.filter((i) => !i.ownerOnly && priceOf(i) !== null);

function allButtons(k: Keyboard) {
  return k.flat();
}

test('every code round-trips through encode and decode', () => {
  const actions = [
    { kind: 'home' }, { kind: 'categories' }, { kind: 'bundle' }, { kind: 'confirm' },
    { kind: 'cancel' }, { kind: 'wallet' }, { kind: 'orders' }, { kind: 'account' },
    { kind: 'signup' }, { kind: 'login' },
    { kind: 'category', service: 'brand-kit' },
    { kind: 'product', sku: 30 },
    { kind: 'topup', amountUsd: 200 },
  ] as const;
  for (const action of actions) {
    assert.deepEqual(decode(encode(action)), action, encode(action));
  }
});

// Telegram silently refuses a callback_data over 64 bytes, which shows up
// as a button that does nothing at all when tapped.
test('no callback code can exceed Telegram 64-byte limit', () => {
  const codes = [
    ...CATEGORIES.map((c) => encode({ kind: 'category', service: c.service })),
    ...sellable.map((i) => encode({ kind: 'product', sku: i.sku })),
    ...[10, 30, 100, 200].map((a) => encode({ kind: 'topup', amountUsd: a })),
    encode({ kind: 'home' }), encode({ kind: 'confirm' }),
  ];
  for (const code of codes) {
    const bytes = new TextEncoder().encode(code).length;
    assert.ok(bytes <= MAX_CALLBACK_BYTES, `${code} is ${bytes} bytes`);
  }
});

// A button from a message sent before a deploy is a real thing to tap.
test('an unrecognised code is unknown, never a throw', () => {
  for (const junk of ['', 'zzz', 'p:', 'p:abc', 'c:', 't:', 't:0', 't:-5', 'p:9.5', '::::']) {
    assert.equal(decode(junk).kind, 'unknown', junk);
  }
});

test('a stranger is offered an account, not a menu they cannot use', () => {
  const screen = homeScreen({ hasAccount: false });
  const codes = allButtons(screen.keyboard).map((b) => b.data);
  assert.ok(codes.includes(encode({ kind: 'signup' })), 'no signup button');
  assert.ok(!codes.includes(encode({ kind: 'orders' })), 'offered orders to a stranger');
  assert.ok(!codes.includes(encode({ kind: 'wallet' })), 'offered a wallet to a stranger');
});

test('a client sees their balance and the things they can do', () => {
  const screen = homeScreen({ hasAccount: true, balanceUsd: 12.5 });
  assert.ok(screen.text.includes('$12.50'), screen.text);
  const codes = allButtons(screen.keyboard).map((b) => b.data);
  for (const kind of ['categories', 'bundle', 'wallet', 'orders', 'account'] as const) {
    assert.ok(codes.includes(encode({ kind })), `missing ${kind}`);
  }
});

test('every category button leads somewhere with products in it', () => {
  for (const category of CATEGORIES) {
    const screen = categoryScreen(category.service, priceOf);
    const products = allButtons(screen.keyboard).filter((b) => b.data?.startsWith('p:'));
    assert.ok(products.length > 0, `${category.label} is empty`);
  }
});

// A product listed at no price is a product somebody taps and is quoted
// nothing for.
test('no unpriced or owner-only product is ever shown', () => {
  const shown = new Set<number>();
  for (const category of CATEGORIES) {
    for (const button of allButtons(categoryScreen(category.service, priceOf).keyboard)) {
      if (button.data?.startsWith('p:')) shown.add(Number(button.data.slice(2)));
    }
  }
  for (const sku of shown) {
    const item = CATALOG.find((i) => i.sku === sku)!;
    assert.ok(!item.ownerOnly, `${item.name} is owner-only and was shown`);
    assert.notEqual(priceOf(item), null, `${item.name} has no price and was shown`);
  }
  // And the converse: everything sellable is reachable.
  for (const item of sellable) {
    assert.ok(shown.has(item.sku), `${item.name} is sellable but unreachable`);
  }
});

test('every product button names its price', () => {
  for (const category of CATEGORIES) {
    for (const button of allButtons(categoryScreen(category.service, priceOf).keyboard)) {
      if (button.data?.startsWith('p:')) {
        assert.match(button.text, /\$\d+\.\d{2}$/, button.text);
      }
    }
  }
});

// Getting stuck three taps deep with no way out is the classic bot trap.
test('every screen below the top has a way back', () => {
  const screens = [
    categoriesScreen(),
    ...CATEGORIES.map((c) => categoryScreen(c.service, priceOf)),
    walletScreen(0, WALLET_PACKAGES),
  ];
  for (const screen of screens) {
    const codes = allButtons(screen.keyboard).map((b) => b.data);
    assert.ok(
      codes.includes(encode({ kind: 'home' })) || codes.includes(encode({ kind: 'categories' })),
      `a screen has no way back: ${screen.text.slice(0, 40)}`
    );
  }
});

// The one screen that spends money. It must never offer "confirm" to
// somebody who cannot pay, and never only "top up" to somebody who can.
test('confirm is offered only when the wallet covers it', () => {
  const rich = confirmScreen('...', { affordable: true, suggestedTopUpUsd: 10 });
  const richCodes = allButtons(rich.keyboard).map((b) => b.data);
  assert.ok(richCodes.includes(encode({ kind: 'confirm' })));
  assert.ok(!richCodes.some((c) => c?.startsWith('t:')), 'pushed a top-up at someone who can pay');

  const broke = confirmScreen('...', { affordable: false, suggestedTopUpUsd: 30 });
  const brokeCodes = allButtons(broke.keyboard).map((b) => b.data);
  assert.ok(!brokeCodes.includes(encode({ kind: 'confirm' })), 'offered to charge an empty wallet');
  assert.ok(brokeCodes.includes(encode({ kind: 'topup', amountUsd: 30 })));
});

test('both confirm screens offer a way out', () => {
  for (const affordable of [true, false]) {
    const screen = confirmScreen('...', { affordable, suggestedTopUpUsd: 10 });
    assert.ok(allButtons(screen.keyboard).some((b) => b.data === encode({ kind: 'cancel' })));
  }
});

test('the packages screen offers every package', () => {
  const screen = walletScreen(5, WALLET_PACKAGES);
  for (const pkg of WALLET_PACKAGES) {
    assert.ok(
      allButtons(screen.keyboard).some((b) => b.data === encode({ kind: 'topup', amountUsd: pkg.amountUsd })),
      `missing $${pkg.amountUsd}`
    );
  }
});

// A client choosing a package in a chat should not be deciding on less
// information than one choosing on the website's cards.
test('every package states the discount it carries', () => {
  const screen = walletScreen(0, WALLET_PACKAGES);
  for (const pkg of WALLET_PACKAGES.filter((p) => p.routineDiscount > 0)) {
    assert.ok(
      screen.text.includes(`${pkg.routineDiscount}% off every order`),
      `$${pkg.amountUsd} does not state its standing discount`
    );
    assert.ok(
      allButtons(screen.keyboard).some((b) => b.text.includes(`${pkg.routineDiscount}%`)),
      `the $${pkg.amountUsd} button does not show its discount`
    );
  }
  // The $10 tier has none. Saying "0% off every order" would read as an
  // offer; it has to say plainly that there is no standing discount.
  // (Checked with a word boundary, because "20% off" ends in "0% off".)
  assert.ok(!/\b0% off/.test(screen.text), screen.text);
  assert.ok(screen.text.includes('no standing discount'), screen.text);
});

test('the first-order discount is stated, and says it covers the bundle', () => {
  const screen = walletScreen(0, WALLET_PACKAGES);
  for (const pkg of WALLET_PACKAGES) {
    assert.ok(screen.text.includes(`${pkg.firstOrderDiscount}% on $${pkg.amountUsd}`), `missing $${pkg.amountUsd}`);
  }
  assert.ok(screen.text.includes('Full Business Setup'), 'does not say the bundle is included');
  assert.ok(screen.text.includes('applies once'), 'does not say it is one-off');
});

// Telegram rejects a command with an uppercase letter or over 32 chars,
// and the whole setMyCommands call fails -- so one bad entry costs the
// entire menu, not just its own line.
test('every registered command is one Telegram will accept', () => {
  for (const { command, description } of CLIENT_COMMANDS) {
    assert.match(command, /^[a-z0-9_]{1,32}$/, command);
    assert.ok(description.length >= 3 && description.length <= 256, command);
  }
});

test('no button has both a code and a url, or neither', () => {
  const screens = [
    homeScreen({ hasAccount: true, balanceUsd: 0 }),
    homeScreen({ hasAccount: false }),
    categoriesScreen(),
    ...CATEGORIES.map((c) => categoryScreen(c.service, priceOf)),
    walletScreen(0, WALLET_PACKAGES),
    confirmScreen('x', { affordable: true, suggestedTopUpUsd: 10 }),
  ];
  for (const screen of screens) {
    for (const button of allButtons(screen.keyboard)) {
      assert.ok(button.text.length > 0, 'a button with no label');
      assert.ok(Boolean(button.data) !== Boolean(button.url), `${button.text} must have exactly one of data/url`);
    }
  }
});

// The one screen a brand-new client sees. It handed over a sign-in code
// and said nothing about what to do next, so a new user went hunting for
// /packages on their own -- which is how the first real test went.
test('a new account is told what to do next, with buttons', () => {
  const screen = justSignedUpScreen('Your account is open.');
  const codes = allButtons(screen.keyboard).map((b) => b.data);
  assert.ok(codes.includes(encode({ kind: 'wallet' })), 'no way to add funds');
  assert.ok(codes.includes(encode({ kind: 'categories' })), 'no way to see the products');
  assert.ok(screen.keyboard.length > 0, 'no buttons at all');
});

// Somebody who has just sent USDT should not be left wondering whether
// they were supposed to confirm something.
test('an issued invoice offers a way onward, not a dead end', () => {
  const screen = invoiceIssuedScreen('Send 10.000007 USDT to 0x...');
  const codes = allButtons(screen.keyboard).map((b) => b.data);
  assert.ok(codes.includes(encode({ kind: 'home' })), 'no way back to the menu');
  assert.ok(codes.includes(encode({ kind: 'categories' })), 'no way to go and order');
  assert.ok(screen.text.includes('10.000007'), 'lost the payment details');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
