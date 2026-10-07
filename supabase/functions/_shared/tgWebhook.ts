// Which update types the webhook must be subscribed to.
//
// Telegram filters on its side: whatever `allowed_updates` was last set to
// on setWebhook, anything outside that list is dropped before it is ever
// sent, with no error, no retry and nothing in our logs. A webhook
// registered for `["message"]` answers every typed command perfectly and
// ignores every tapped button -- the bot looks alive and the menu looks
// dead, which is exactly how this was found.
//
// Omitting allowed_updates entirely means "all but the chat-member ones",
// which would also work, but then the subscription is implicit and the
// next person to run setWebhook with a narrower list breaks the buttons
// again silently. Stating it, and re-checking it on every sweep, makes it
// something that cannot drift.

/** Everything this bot acts on. `message` carries text, voice and files. */
export const REQUIRED_UPDATES = ['message', 'callback_query'] as const;

export interface WebhookInfo {
  url?: string;
  /** Absent means Telegram's default (everything but chat-member updates). */
  allowed_updates?: string[];
  pending_update_count?: number;
  last_error_message?: string;
}

export interface WebhookVerdict {
  /** True when setWebhook must be called to put it right. */
  repair: boolean;
  /** One line, for the log, saying what was wrong or that nothing was. */
  reason: string;
}

/**
 * Decides whether the registered webhook still matches what this build needs.
 *
 * Pure so the condition can be tested: getting it wrong in the "nothing to
 * do" direction leaves buttons dead, and in the other direction re-registers
 * the webhook on every sweep for no reason.
 */
export function checkWebhook(info: WebhookInfo | null, expectedUrl: string): WebhookVerdict {
  if (!info || !info.url) return { repair: true, reason: 'no webhook registered' };
  if (info.url !== expectedUrl) {
    return { repair: true, reason: `webhook points at ${info.url}, expected ${expectedUrl}` };
  }

  // Absent (or empty) is Telegram's default, which does include
  // callback_query -- but see the note above: leave it implicit and it is
  // one careless setWebhook away from breaking again.
  const allowed = info.allowed_updates;
  if (!allowed || allowed.length === 0) {
    return { repair: true, reason: 'allowed_updates unset, pinning it explicitly' };
  }

  const missing = REQUIRED_UPDATES.filter((u) => !allowed.includes(u));
  if (missing.length > 0) {
    return { repair: true, reason: `allowed_updates is missing ${missing.join(', ')}` };
  }

  return { repair: false, reason: 'webhook already correct' };
}
