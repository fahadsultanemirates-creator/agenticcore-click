// Run with: node --experimental-strip-types supabase/functions/_shared/tgSignup.test.ts

import assert from 'node:assert/strict';
import { isValidEmail, normaliseEmail, signupTurn, type SignupState } from './tgSignup.ts';

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

const idle: SignupState = { step: 'idle' };

test('starting asks for an email and nothing else', () => {
  const turn = signupTurn(idle, '/start');
  assert.equal(turn.state.step, 'email');
  assert.equal(turn.action, 'none');
  assert.match(turn.reply, /email/i);
});

test('a good address moves to confirmation, lower-cased', () => {
  const turn = signupTurn({ step: 'email' }, '  Fahad@Example.COM ');
  assert.equal(turn.state.step, 'confirm');
  assert.equal(turn.state.email, 'fahad@example.com');
  assert.ok(turn.reply.includes('fahad@example.com'));
  assert.equal(turn.action, 'none');
});

// The failure that matters: a client typed something wrong and must be
// able to see what, and to try again, without starting over.
test('a bad address says so, quotes it back, and stays on the question', () => {
  const turn = signupTurn({ step: 'email' }, 'fahad at example');
  assert.equal(turn.state.step, 'email');
  assert.equal(turn.action, 'none');
  assert.ok(turn.reply.includes('fahad at example'), 'did not quote what they typed');
  assert.match(turn.reply, /cancel/i, 'did not offer a way out');
});

test('YES at the confirm step creates the account', () => {
  for (const yes of ['yes', 'YES', 'Yeah', 'ok', 'go ahead', 'confirm']) {
    const turn = signupTurn({ step: 'confirm', email: 'a@b.com' }, yes);
    assert.equal(turn.action, 'create', yes);
    assert.equal(turn.state.step, 'idle', yes);
  }
});

test('no at the confirm step creates nothing', () => {
  for (const no of ['no', 'NOPE', 'cancel', 'wait']) {
    const turn = signupTurn({ step: 'confirm', email: 'a@b.com' }, no);
    assert.equal(turn.action, 'cancel', no);
    assert.equal(turn.state.step, 'idle', no);
  }
});

// Someone who sees the wrong address in the confirmation types the right
// one. Asking "reply YES or no" at that is how a client gets stuck.
test('a second address at the confirm step replaces the first', () => {
  const turn = signupTurn({ step: 'confirm', email: 'typo@example.com' }, 'right@example.com');
  assert.equal(turn.state.step, 'confirm');
  assert.equal(turn.state.email, 'right@example.com');
  assert.equal(turn.action, 'none');
  assert.ok(turn.reply.includes('right@example.com'));
});

test('an unreadable answer at the confirm step re-states the choices', () => {
  const turn = signupTurn({ step: 'confirm', email: 'a@b.com' }, 'what does that mean');
  assert.equal(turn.action, 'none');
  assert.equal(turn.state.email, 'a@b.com', 'lost the address');
  assert.ok(turn.reply.includes('a@b.com'));
});

test('/cancel works at every step, including before anything started', () => {
  for (const state of [idle, { step: 'email' } as SignupState, { step: 'confirm', email: 'a@b.com' } as SignupState]) {
    const turn = signupTurn(state, '/cancel');
    assert.equal(turn.action, 'cancel', state.step);
    assert.equal(turn.state.step, 'idle', state.step);
  }
});

test('an account is never created without an explicit yes', () => {
  const inputs = ['hello', 'a@b.com', '/start', 'maybe', '', '  '];
  for (const state of [idle, { step: 'email' } as SignupState]) {
    for (const input of inputs) {
      assert.notEqual(signupTurn(state, input).action, 'create', `${state.step} + "${input}"`);
    }
  }
});

test('real addresses are accepted', () => {
  const good = [
    'fahad@example.com',
    'first.last@sub.domain.co.uk',
    'a+tag@example.io',
    "o'brien@example.com",
    'x_y-z@example-host.com',
  ];
  for (const email of good) assert.ok(isValidEmail(email), email);
});

test('things that are not addresses are refused', () => {
  const bad = [
    '',
    'fahad',
    'fahad@',
    '@example.com',
    'fahad@example',
    'fahad @example.com',
    'fahad@@example.com',
    'fahad@example..com',
    'fahad@.example.com',
    'fahad@example.',
    'fahad@example.c',
    'fahad@example.123',
    `${'a'.repeat(65)}@example.com`,
    `${'a'.repeat(250)}@example.com`,
  ];
  for (const email of bad) assert.ok(!isValidEmail(email), email || '(empty)');
});

test('addresses are compared without case', () => {
  assert.equal(normaliseEmail('  Fahad@Example.Com '), 'fahad@example.com');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
