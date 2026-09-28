// Who builds this one -- us, or somebody outside.
//
// The supervisor's job has always been to turn a task into exactly one
// agent. Adding an outside worker does not change that; it adds candidates.
// What it must not do is make the answer harder to predict, because a task
// silently leaving the building is the kind of surprise that is only noticed
// when a client asks where their file is.
//
// So the decision is a short ordered list, and every step is something
// somebody deliberately did:
//
//   1. Kill switch. GROKBOT_ENABLED unset or not 'true' and nothing external
//      happens at all, whatever the routes say. One environment variable
//      takes the whole path out of service.
//   2. Owner tasks never leave. Fahad talks to Grok Bot directly; routing his
//      own work through the framework would double-handle it, and the
//      handoff spec forbids it outright.
//   3. A per-task override, when one was set. This is how a single job gets
//      tried without committing a product to it.
//   4. A per-SKU route the owner set with /assign.
//   5. Otherwise the built-in worker, exactly as before.
//
// Pure and import-free, the same split as orderMatch.ts against orders.ts:
// the decision is testable without a database, because the cost of getting
// it wrong is a task going somewhere else quietly -- precisely the failure a
// test can hold still, and precisely the one nobody notices by reading.

/** The worker that runs inside this repo, and the one that does not. */
export const GROKBOT_AGENT = 'worker-grokbot';

export interface RoutingInputs {
  /** GROKBOT_ENABLED === 'true'. The kill switch. */
  externalEnabled: boolean;
  /** 'owner' | 'website' | null -- where the task came from. */
  source: string | null;
  /** tasks.assigned_agent, when this one task was pointed somewhere. */
  assignedAgent: string | null;
  /** agent_routes for this product, when the owner assigned the SKU. */
  routedAgent: string | null;
  /**
   * Agents that already gave this task back.
   *
   * Without this the hand-back is a loop: releasing a task clears its
   * assignment, but the product is still routed to the same agent, so the
   * dispatcher offers it straight back and the pair trade it forever, one
   * webhook call every two minutes. An agent that has said no to a task has
   * said no to that task.
   *
   * REQUIRED, deliberately. It was optional, and the supervisor simply did
   * not pass it -- so the column was written on every hand-back and read by
   * nobody, and the loop stayed open. The unit tests passed throughout,
   * because they tested this function while the caller was the broken part.
   * A required field makes that particular mistake a compile error instead
   * of a silent one; pass [] when there are genuinely none.
   */
  excludedAgents: string[];
  /** The worker that would have run before any of this existed. */
  builtIn: string;
}

export interface RoutingChoice {
  agent: string;
  /** True when the work leaves this codebase. */
  external: boolean;
  /** Which rule decided, so a surprising route is explainable from the log. */
  why: 'disabled' | 'owner' | 'task_override' | 'sku_route' | 'built_in' | 'handed_back';
}

export function chooseAgent(input: RoutingInputs): RoutingChoice {
  const builtIn = (why: RoutingChoice['why']): RoutingChoice => ({ agent: input.builtIn, external: false, why });
  const excluded = new Set(input.excludedAgents);

  // 1. The switch is off: nothing external, whatever else is configured.
  if (!input.externalEnabled) return builtIn('disabled');

  // 2. The owner's own work never goes out through the framework.
  if (input.source === 'owner') return builtIn('owner');

  // 3. This exact task was pointed somewhere.
  if (input.assignedAgent && !excluded.has(input.assignedAgent)) {
    return { agent: input.assignedAgent, external: input.assignedAgent !== input.builtIn, why: 'task_override' };
  }

  // 4. This product was assigned.
  if (input.routedAgent && !excluded.has(input.routedAgent)) {
    return { agent: input.routedAgent, external: input.routedAgent !== input.builtIn, why: 'sku_route' };
  }

  // Every candidate has already handed this task back. Say so distinctly
  // from a plain built-in route, because "it was offered out and came back"
  // and "it was never offered out" look identical in a log otherwise.
  if ((input.assignedAgent && excluded.has(input.assignedAgent)) || (input.routedAgent && excluded.has(input.routedAgent))) {
    return builtIn('handed_back');
  }

  return builtIn('built_in');
}

