// The shared action-envelope shape both the regex fast path and the
// conversational engine (_shared/botConversation.ts) route into --
// dispatched by telegram-webhook to the same handler functions either way.

export type BotIntent =
  | { intent: 'queue' }
  | { intent: 'help' }
  | { intent: 'stats' }
  | { intent: 'status'; taskId: string }
  | { intent: 'new'; sku: number; brief: string; referenceFiles?: string[]; details?: Record<string, unknown> }
  | { intent: 'revise'; taskId: string; note: string }
  | { intent: 'files'; taskId: string }
  | { intent: 'deliver'; taskId: string; url: string }
  | { intent: 'avatars'; gender?: string }
  | { intent: 'voices'; filter?: string }
  | { intent: 'addavatar'; id: string; name: string }
  | { intent: 'addvoice'; id: string; name: string }
  | { intent: 'report'; url: string }
  | { intent: 'ask'; question: string }
  | { intent: 'chat'; reply: string }
  | { intent: 'unknown' };
