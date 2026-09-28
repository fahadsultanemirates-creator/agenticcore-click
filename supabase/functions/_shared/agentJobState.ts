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

// How far along the line a status is.
//
// A job only ever moves forward. This exists because fallbackToBuiltIn was
// writing back the status it had read a moment earlier -- so releasing an
// accepted job set it to 'released' and then immediately back to
// 'accepted', leaving it open to be acted on again. A status change that
// goes backwards is always a bug or a replay, so it is refused rather than
// applied.
const RANK: Record<JobStatus, number> = {
  offered: 0,
  accepted: 1,
  submitted: 2,
  // The four ends of the line all sit past every live state; which one it is
  // says how it ended, not how far it got.
  delivered: 3,
  released: 3,
  failed: 3,
  expired: 3
};

export function isStatus(value: string): value is JobStatus {
  return value in RANK;
}

/** True when `next` is a move forward (or a terminal state) from `current`. */
export function movesForward(current: string, next: string): boolean {
  if (!isStatus(current) || !isStatus(next)) return false;
  // Already finished: nothing moves it, not even another terminal state.
  if (isClosed(current)) return false;
  return RANK[next] > RANK[current];
}
