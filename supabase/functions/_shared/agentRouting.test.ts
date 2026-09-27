// Run with: node --experimental-strip-types supabase/functions/_shared/agents.test.ts
//
// Routing decides whether a client's work leaves this building. Getting it
// wrong is silent -- the task simply goes somewhere else and nobody notices
// until a file does not arrive -- so the order of the rules is pinned here
// rather than trusted to reading.

import assert from 'node:assert/strict';
import { chooseAgent, type RoutingInputs } from './agentRouting.ts';

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

const base: RoutingInputs = {
  externalEnabled: true,
  source: 'website',
  assignedAgent: null,
  routedAgent: null,
  builtIn: 'worker-pdf'
};

test('with nothing configured, everything still goes to the built-in worker', () => {
  const choice = chooseAgent(base);
  assert.equal(choice.agent, 'worker-pdf');
  assert.equal(choice.external, false);
  assert.equal(choice.why, 'built_in');
});

// The whole path has to be removable with one environment variable, or there
// is no way to stop it in a hurry.
test('the kill switch beats every route', () => {
  const choice = chooseAgent({
    ...base,
    externalEnabled: false,
    assignedAgent: 'worker-grokbot',
    routedAgent: 'worker-grokbot'
  });
  assert.equal(choice.agent, 'worker-pdf');
  assert.equal(choice.why, 'disabled');
});

// The handoff spec forbids this outright: the owner talks to Grok Bot
// directly, so routing his own work through the framework double-handles it.
test("the owner's own work never leaves, even on an assigned product", () => {
  const choice = chooseAgent({ ...base, source: 'owner', routedAgent: 'worker-grokbot' });
  assert.equal(choice.agent, 'worker-pdf');
  assert.equal(choice.why, 'owner');
});

test("the owner's own work never leaves, even when the task names an agent", () => {
  const choice = chooseAgent({ ...base, source: 'owner', assignedAgent: 'worker-grokbot' });
  assert.equal(choice.external, false);
  assert.equal(choice.why, 'owner');
});

test('an assigned product goes to that agent', () => {
  const choice = chooseAgent({ ...base, routedAgent: 'worker-grokbot' });
  assert.equal(choice.agent, 'worker-grokbot');
  assert.equal(choice.external, true);
  assert.equal(choice.why, 'sku_route');
});

test('a single task can be pointed somewhere without committing the product', () => {
  const choice = chooseAgent({ ...base, assignedAgent: 'worker-grokbot' });
  assert.equal(choice.agent, 'worker-grokbot');
  assert.equal(choice.why, 'task_override');
});

// The override exists to try one job somewhere. It has to work in both
// directions, or a product assigned by mistake cannot be rescued per task.
test('a task override beats the product route, in both directions', () => {
  const out = chooseAgent({ ...base, assignedAgent: 'worker-grokbot', routedAgent: 'worker-pdf' });
  assert.equal(out.agent, 'worker-grokbot');

  const back = chooseAgent({ ...base, assignedAgent: 'worker-pdf', routedAgent: 'worker-grokbot' });
  assert.equal(back.agent, 'worker-pdf');
  assert.equal(back.external, false, 'routed back to the built-in worker, so it is not an external hand-off');
});

// A route pointing at the worker that would have run anyway is not an
// external hand-off, and must not open a job or wait on a deadline.
test('a route naming the built-in worker is not treated as external', () => {
  const choice = chooseAgent({ ...base, routedAgent: 'worker-pdf' });
  assert.equal(choice.external, false);
});

test('every decision says which rule made it', () => {
  const reasons = new Set([
    chooseAgent({ ...base, externalEnabled: false }).why,
    chooseAgent({ ...base, source: 'owner' }).why,
    chooseAgent({ ...base, assignedAgent: 'worker-grokbot' }).why,
    chooseAgent({ ...base, routedAgent: 'worker-grokbot' }).why,
    chooseAgent(base).why
  ]);
  assert.deepEqual([...reasons].sort(), ['built_in', 'disabled', 'owner', 'sku_route', 'task_override']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
