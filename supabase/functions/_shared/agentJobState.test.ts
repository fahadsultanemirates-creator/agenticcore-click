// Run with: node --experimental-strip-types supabase/functions/_shared/agentJobState.test.ts

import assert from 'node:assert/strict';
import { ALLOWED_FROM, canAct, isClosed, isKnownAction, type JobAction } from './agentJobState.ts';

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

test('the normal run is allowed end to end', () => {
  assert.ok(canAct('accept', 'offered'));
  assert.ok(canAct('upload_url', 'accepted'));
  assert.ok(canAct('submit', 'accepted'));
});

// Submitting a job nobody accepted means either a confused agent or not the
// agent at all. Either way it must not deliver to a client.
test('a job cannot be submitted before it is accepted', () => {
  assert.equal(canAct('submit', 'offered'), false);
});

test('files cannot be staged for a job that might still go elsewhere', () => {
  assert.equal(canAct('upload_url', 'offered'), false);
});

// The important one. Once a job is closed the task has already been
// re-queued in-house, so a late callback would deliver the same work twice.
test('nothing can act on a closed job', () => {
  for (const status of ['delivered', 'released', 'failed', 'expired']) {
    assert.ok(isClosed(status), `${status} should be closed`);
    for (const action of Object.keys(ALLOWED_FROM) as JobAction[]) {
      assert.equal(canAct(action, status), false, `${action} must be refused on a ${status} job`);
    }
  }
});

test('a crashed agent can still ask what it was doing', () => {
  assert.ok(canAct('fetch', 'offered'));
  assert.ok(canAct('fetch', 'accepted'));
  assert.ok(canAct('fetch', 'submitted'));
});

test('an agent can hand a job back from either live state', () => {
  for (const action of ['release', 'failed', 'needs_info'] as JobAction[]) {
    assert.ok(canAct(action, 'offered'), `${action} from offered`);
    assert.ok(canAct(action, 'accepted'), `${action} from accepted`);
  }
});

test('an invented action is not an action', () => {
  assert.equal(isKnownAction('deliver'), false);
  assert.equal(isKnownAction('accept'), true);
});

test('no action can act from a status that is not real', () => {
  for (const action of Object.keys(ALLOWED_FROM) as JobAction[]) {
    assert.equal(canAct(action, 'in_progress'), false);
    assert.equal(canAct(action, ''), false);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
