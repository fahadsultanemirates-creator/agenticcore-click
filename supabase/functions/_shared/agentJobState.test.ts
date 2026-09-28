// Run with: node --experimental-strip-types supabase/functions/_shared/agentJobState.test.ts

import assert from 'node:assert/strict';
import { ALLOWED_FROM, canAct, isClosed, isKnownAction, movesForward, type JobAction } from './agentJobState.ts';

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

// The second bug the review found. fallbackToBuiltIn wrote back the status
// it had read a moment earlier, so releasing an accepted job set it to
// 'released' and then straight back to 'accepted' -- leaving a closed job
// open to be acted on again.
test('a job never moves backwards', () => {
  assert.equal(movesForward('accepted', 'offered'), false);
  assert.equal(movesForward('submitted', 'accepted'), false);
  assert.equal(movesForward('released', 'accepted'), false, 'the exact regression');
});

test('a job moves forward along the line', () => {
  assert.ok(movesForward('offered', 'accepted'));
  assert.ok(movesForward('accepted', 'submitted'));
  assert.ok(movesForward('submitted', 'delivered'));
  assert.ok(movesForward('offered', 'expired'));
  assert.ok(movesForward('accepted', 'failed'));
});

// Two callbacks arriving together, or a sweep racing a release: whichever
// lands second must be refused, not applied on top.
test('a finished job cannot be finished a second way', () => {
  for (const ending of ['delivered', 'released', 'failed', 'expired']) {
    for (const next of ['delivered', 'released', 'failed', 'expired', 'accepted']) {
      assert.equal(movesForward(ending, next), false, `${ending} → ${next} must be refused`);
    }
  }
});

test('the same status twice is not a move', () => {
  assert.equal(movesForward('accepted', 'accepted'), false);
});

test('a status nobody defined is not a move', () => {
  assert.equal(movesForward('offered', 'in_progress'), false);
  assert.equal(movesForward('made_up', 'delivered'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
