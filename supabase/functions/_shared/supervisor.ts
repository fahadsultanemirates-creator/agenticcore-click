// THE SUPERVISOR -- the layer between "a task exists" and "a worker builds it".
//
// It does not generate anything. Its entire specialism is deciding WHICH
// product number a task really is, and therefore which agent owns it.
//
// Before this, the dispatcher was a seven-line lookup from task.type to a
// function name. That is routing by the word a task happened to be filed
// under, and the word is often wrong: a logo submitted through the brand-kit
// form arrives as type "brand-kit", and the brand-kit worker builds
// brand-kit-shaped things, so a logo came back as a document. Nothing in the
// system ever asked "what IS this?" -- each worker answered that privately,
// after routing had already committed to an answer.
//
// So the question is asked once, here, before any worker runs:
//
//   1. Resolve the task to exactly one catalog number.
//   2. Correct the task row to match that number -- its service, its selector
//      fields, its revision allowance -- so the worker reads an unambiguous
//      instruction instead of re-deriving one.
//   3. Hand the number to the agent that owns that block of numbers.
//
// A task that cannot be resolved to a number is stopped here, as needs_info,
// rather than sent to a worker to guess at. Guessing is what produced a
// fifteen-page deck when a one-page letterhead was ordered.

import { getSku, resolveSku, expandSku, type CatalogItem } from './catalog.ts';
import { supabaseAdmin } from './storage.ts';

// Which agent owns which block of product numbers. Keyed by the catalog's
// own `service`, never by the raw task.type -- that is the whole point: the
// number decides the agent, not the word on the form.
const AGENT_BY_SERVICE: Record<string, string> = {
  website: 'worker-website',
  image: 'worker-image',
  pdf: 'worker-pdf',
  documents: 'worker-pdf',
  'brand-kit': 'worker-pdf',
  social: 'worker-social',
  video: 'worker-video',
  'business-report': 'worker-business-report'
};

export interface SupervisedTask {
  id: string;
  public_id: string;
  type: string;
  source?: string | null;
  sku?: number | null;
  revisions_allowed?: number | null;
  payload?: Record<string, unknown> | null;
}

export interface Routing {
  /** The worker to invoke, or null when the task cannot be routed. */
  agent: string | null;
  item: CatalogItem | null;
  /** Corrections written back to the task row on the way through. */
  corrections: string[];
  /** Set when the task is not routable; the text is client-readable. */
  problem?: string;
}

// Step 1: what IS this task? Trust an explicitly recorded number first (it
// was fixed at purchase and must not drift), then a number carried in the
// payload by a router, and only then infer one from the shape of the payload.
function identify(task: SupervisedTask): CatalogItem | null {
  const payload = task.payload ?? {};

  if (task.sku != null) {
    const recorded = getSku(task.sku);
    if (recorded) return recorded;
  }

  const carried = Number(payload.sku);
  if (Number.isFinite(carried)) {
    const fromPayload = getSku(carried);
    if (fromPayload) return fromPayload;
  }

  return resolveSku(task.type, payload);
}

// Step 2: make the row say what the supervisor decided. Workers re-read the
// task from the database, so a correction here is a correction they cannot
// miss -- unlike a value passed in a call, which only the first worker sees.
async function reconcile(task: SupervisedTask, item: CatalogItem): Promise<string[]> {
  const corrections: string[] = [];
  const update: Record<string, unknown> = {};

  const expanded = expandSku(item.sku, task.payload ?? {})!;

  // Filed under the wrong service. This is the logo-as-brand-kit case: the
  // number is right, the word it was filed under sends it to the wrong agent.
  if (task.type !== expanded.type) {
    update.type = expanded.type;
    corrections.push(`type "${task.type}" -> "${expanded.type}" (product ${item.sku} belongs to ${expanded.type})`);
  }

  // The selector fields ARE the spec discriminator. A task that arrived
  // without them (free-text intake, an older row) gets them filled in from
  // the number, so the worker branches on a real value rather than "".
  const missingSelectors = Object.entries(item.selector).filter(
    ([key, value]) => String((task.payload ?? {})[key] ?? '') !== value
  );
  if (missingSelectors.length > 0 || Number((task.payload ?? {}).sku) !== item.sku) {
    update.payload = expanded.payload;
    if (missingSelectors.length > 0) {
      corrections.push(`payload ${missingSelectors.map(([k, v]) => `${k}="${v}"`).join(', ')} set from product ${item.sku}`);
    }
  }

  if (task.sku !== item.sku) {
    update.sku = item.sku;
    corrections.push(`sku recorded as ${item.sku} (${item.name})`);
  }

  // Only ever fill in a missing allowance. An allowance already on the row was
  // what that client was sold; changing the catalog later must not rewrite it.
  if (task.revisions_allowed == null) {
    update.revisions_allowed = item.revisions;
    corrections.push(`revisions_allowed set to ${item.revisions}`);
  }

  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from('tasks').update(update).eq('id', task.id);
    if (error) {
      console.error(`supervisor: could not reconcile ${task.public_id}`, error);
      return [];
    }
  }

  return corrections;
}

// The whole job, in one call. Returns the agent to hand the task to.
export async function superviseTask(task: SupervisedTask): Promise<Routing> {
  const item = identify(task);

  if (!item) {
    return {
      agent: null,
      item: null,
      corrections: [],
      problem:
        `This request doesn't match any product we sell -- it came in as "${task.type}" but nothing in the ` +
        `catalogue fits the details given. Tell us which service you meant and we'll re-queue it.`
    };
  }

  // Owner-only products (the business report) are not purchasable. A client
  // task that resolves to one means routing went wrong upstream, and the
  // safe answer is to stop rather than to build it and bill for it.
  if (item.ownerOnly && task.source === 'website') {
    return {
      agent: null,
      item,
      corrections: [],
      problem: `"${item.name}" isn't a product clients can order. Nothing was built for this request.`
    };
  }

  const agent = AGENT_BY_SERVICE[item.service] ?? null;
  if (!agent) {
    console.error(`supervisor: product ${item.sku} names service "${item.service}" with no agent`);
    return {
      agent: null,
      item,
      corrections: [],
      problem: `We don't currently have anyone able to build "${item.name}". Nothing was charged for this.`
    };
  }

  const corrections = await reconcile(task, item);
  return { agent, item, corrections };
}
