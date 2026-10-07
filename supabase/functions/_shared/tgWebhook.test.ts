// Run with: node --experimental-strip-types supabase/functions/_shared/tgWebhook.test.ts

import assert from 'node:assert/strict';
import { checkWebhook, REQUIRED_UPDATES } from './tgWebhook.ts';

const URL = 'https://project.supabase.co/functions/v1/telegram-webhook';

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

test('a webhook subscribed to everything it needs is left alone', () => {
  const verdict = checkWebhook({ url: URL, allowed_updates: ['message', 'callback_query'] }, URL);
  assert.equal(verdict.repair, false);
});

test('extra update types are not a reason to re-register', () => {
  const verdict = checkWebhook(
    { url: URL, allowed_updates: ['message', 'callback_query', 'edited_message'] },
    URL
  );
  assert.equal(verdict.repair, false);
});

// The bug this module exists for: typed commands worked, tapped buttons
// produced no request at all, because Telegram was dropping them.
test('a webhook without callback_query is repaired', () => {
  const verdict = checkWebhook({ url: URL, allowed_updates: ['message'] }, URL);
  assert.equal(verdict.repair, true);
  assert.match(verdict.reason, /callback_query/);
});

test('a webhook without message is repaired', () => {
  const verdict = checkWebhook({ url: URL, allowed_updates: ['callback_query'] }, URL);
  assert.equal(verdict.repair, true);
  assert.match(verdict.reason, /\bmessage\b/);
});

// Telegram's default does cover callback_query, so this is not broken --
// it is unpinned, and the next narrower setWebhook breaks it silently.
test('an unset allowed_updates is pinned rather than trusted', () => {
  assert.equal(checkWebhook({ url: URL }, URL).repair, true);
  assert.equal(checkWebhook({ url: URL, allowed_updates: [] }, URL).repair, true);
});

test('a webhook pointing somewhere else is repaired', () => {
  const verdict = checkWebhook({ url: 'https://old.example/hook', allowed_updates: [...REQUIRED_UPDATES] }, URL);
  assert.equal(verdict.repair, true);
  assert.match(verdict.reason, /old\.example/);
});

test('no webhook at all is repaired', () => {
  assert.equal(checkWebhook(null, URL).repair, true);
  assert.equal(checkWebhook({}, URL).repair, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
