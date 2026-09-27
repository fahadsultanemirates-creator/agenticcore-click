// What an external agent is allowed to do next.
//
// A built-in worker cannot get out of step with itself: it runs once and
// returns. An outside agent can crash and retry, send the same callback
// twice, or submit a job it never accepted -- so the order has to be
// enforced rather than assumed.
//
// The rule is one-way. A job moves offered → accepted → submitted →
// delivered, and once it has left the line (released, failed, expired,
// delivered) nothing brings it back, because by then the task has already
// been re-queued to a built-in worker and a late callback would deliver the
// same work twice.

export type JobStatus = 'offered' | 'accepted' | 'submitted' | 'delivered' | 'released' | 'failed' | 'expired';

export type JobAction =
  | 'fetch'
  | 'accept'
  | 'progress'
  | 'upload_url'
  | 'submit'
  | 'needs_info'
  | 'release'
  | 'failed';

/** Which statuses each action may act from. */
export const ALLOWED_FROM: Record<JobAction, JobStatus[]> = {
  // Readable at any live stage: an agent recovering from a crash needs to
  // be able to ask what it was doing.
  fetch: ['offered', 'accepted', 'submitted'],
  accept: ['offered'],
  progress: ['accepted'],
  // Uploading before accepting would put files in staging for a job that
  // may still go to somebody else.
  upload_url: ['accepted'],
  submit: ['accepted'],
  needs_info: ['offered', 'accepted'],
  release: ['offered', 'accepted'],
  failed: ['offered', 'accepted']
};

export function isKnownAction(action: string): action is JobAction {
  return action in ALLOWED_FROM;
}

export function canAct(action: JobAction, status: string): boolean {
  return (ALLOWED_FROM[action] as string[]).includes(status);
}

/** Statuses a job never leaves. */
export const CLOSED: JobStatus[] = ['delivered', 'released', 'failed', 'expired'];

export function isClosed(status: string): boolean {
  return (CLOSED as string[]).includes(status);
}
