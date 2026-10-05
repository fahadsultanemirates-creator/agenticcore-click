// The signup conversation, as a pure function.
//
// Three questions in a chat does not sound like something worth
// extracting, but a webhook is stateless and every branch of it ("they
// typed /cancel halfway", "they sent a sentence where an email was
// asked for", "they answered the confirm with 'ok'") is a place where a
// client ends up stuck with no way forward and no error. None of that
// needs a database to test.
//
// The webhook owns the side effects -- creating the account, issuing a
// code, replying. This owns what the next question is.

export type SignupStep = 'idle' | 'email' | 'confirm';

export interface SignupState {
  step: SignupStep;
  email?: string;
}

export type SignupAction = 'none' | 'create' | 'cancel';

export interface SignupTurn {
  state: SignupState;
  reply: string;
  action: SignupAction;
}

export const START_SIGNUP = 'Opening an account takes one thing: an email address.\n\nWhat is yours?';

const CANCELLED = 'Nothing created. Send /start whenever you want to pick this back up.';

/**
 * Accepted as a yes, in a chat where the question was "shall I create it".
 *
 * Deliberately a fixed list rather than a model call. A wrong reading
 * here creates an account for someone who said no, or refuses someone
 * who said yes, and neither is worth a second of latency and a bill.
 */
const YES = new Set(['yes', 'y', 'yeah', 'yep', 'ok', 'okay', 'sure', 'confirm', 'create', 'go', 'go ahead', 'do it']);
const NO = new Set(['no', 'n', 'nope', 'cancel', 'stop', 'wait', 'nevermind', 'never mind']);

/**
 * Good enough to be an address, strict enough to catch a typo.
 *
 * Not RFC 5322 -- that grammar accepts things no mail server will, and
 * rejecting a real address is far worse here than accepting a fake one,
 * because a fake one simply never receives anything while a rejected
 * real one stops a signup dead. So: one @, something either side, a dot
 * in the domain, no whitespace, nothing absurd in length.
 */
export function isValidEmail(input: string): boolean {
  const value = input.trim();
  if (value.length < 6 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (local.length === 0 || local.length > 64) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return tld.length >= 2 && /^[a-z]+$/i.test(tld);
}

/** Addresses are compared lower-cased; nobody means a different account by capitalising. */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function signupTurn(state: SignupState, rawInput: string): SignupTurn {
  const input = rawInput.trim();
  const lower = input.toLowerCase();

  // /cancel works at any point, including before anything started -- a
  // client who is not sure where they are should always be able to get
  // back to a known place.
  if (lower === '/cancel' || lower === 'cancel') {
    return { state: { step: 'idle' }, reply: CANCELLED, action: 'cancel' };
  }

  switch (state.step) {
    case 'idle':
      return { state: { step: 'email' }, reply: START_SIGNUP, action: 'none' };

    case 'email': {
      if (!isValidEmail(input)) {
        return {
          state: { step: 'email' },
          reply:
            `"${input}" does not look like an email address. Send it on its own, ` +
            'like name@example.com — or /cancel to stop.',
          action: 'none'
        };
      }
      const email = normaliseEmail(input);
      return {
        state: { step: 'confirm', email },
        reply:
          `I will open an account for ${email}.\n\n` +
          'Reply YES to create it, or send a different address.',
        action: 'none'
      };
    }

    case 'confirm': {
      if (YES.has(lower)) {
        return { state: { step: 'idle' }, reply: '', action: 'create' };
      }
      if (NO.has(lower)) {
        return { state: { step: 'idle' }, reply: CANCELLED, action: 'cancel' };
      }
      // Anything else at the confirm step is most often a corrected
      // address, so take it as one rather than asking the same question
      // again at someone who has already answered it.
      if (isValidEmail(input)) {
        const email = normaliseEmail(input);
        return {
          state: { step: 'confirm', email },
          reply: `Using ${email} instead.\n\nReply YES to create the account.`,
          action: 'none'
        };
      }
      return {
        state,
        reply: `Reply YES to open the account for ${state.email}, send a different email address, or /cancel.`,
        action: 'none'
      };
    }
  }
}
