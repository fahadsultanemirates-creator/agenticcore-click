// Accounts that exist because somebody messaged the bot.
//
// Everything here is keyed on Telegram's own user id, taken from the
// signed webhook payload. Nothing in a message body ever selects an
// account: a chat that types "I am account 1007" is a chat that typed
// some words.
import { supabaseAdmin } from './storage.ts';
import {
  CODE_TTL_DAYS,
  expiryFrom,
  formatCode,
  generateCode,
  hashCode,
  normaliseCode
} from './signinCode.ts';
import type { SignupState } from './tgSignup.ts';

export interface TelegramAccount {
  userId: string;
  tgUserId: number;
  chatId: number;
  passwordSetAt: string | null;
  graceExpiresAt: string | null;
  pausedAt: string | null;
}

interface AccountRow {
  user_id: string;
  tg_user_id: number;
  chat_id: number;
  password_set_at: string | null;
  grace_expires_at: string | null;
  paused_at: string | null;
}

function toAccount(row: AccountRow): TelegramAccount {
  return {
    userId: row.user_id,
    tgUserId: Number(row.tg_user_id),
    chatId: Number(row.chat_id),
    passwordSetAt: row.password_set_at,
    graceExpiresAt: row.grace_expires_at,
    pausedAt: row.paused_at
  };
}

const ACCOUNT_COLUMNS = 'user_id, tg_user_id, chat_id, password_set_at, grace_expires_at, paused_at';

export async function findAccountByTelegramId(tgUserId: number): Promise<TelegramAccount | null> {
  const { data, error } = await supabaseAdmin
    .from('telegram_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('tg_user_id', tgUserId)
    .maybeSingle<AccountRow>();
  if (error) {
    console.error(`findAccountByTelegramId(${tgUserId}) failed:`, error);
    return null;
  }
  return data ? toAccount(data) : null;
}

export type CreateResult =
  | { ok: true; code: string; expiresAt: Date; userId: string }
  | { ok: false; reason: 'email_taken' | 'already_linked' | 'failed' };

/**
 * Creates the auth user, links the Telegram id to it, and issues the
 * first sign-in code.
 *
 * The user is created with no password at all, which Supabase allows.
 * That is not a gap to be filled with a random one: a random password
 * nobody knows is indistinguishable from no password except that the
 * account looks, in every query, as though its owner has already chosen
 * one -- and the 30-day prompt would then never fire for the people who
 * most need it.
 */
export async function createAccountFromTelegram(opts: {
  tgUserId: number;
  chatId: number;
  username?: string;
  email: string;
}): Promise<CreateResult> {
  const existing = await findAccountByTelegramId(opts.tgUserId);
  if (existing) return { ok: false, reason: 'already_linked' };

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: opts.email,
    // Telegram has already shown us a real person at a real account. The
    // address is for reaching them, not for proving anything, and an
    // unconfirmed user cannot sign in later to set their password.
    email_confirm: true
  });

  if (error || !created?.user) {
    // Supabase reports a duplicate address as a 422. Worth separating:
    // "that email already has an account" is a thing the client can act
    // on, where "something went wrong" is not.
    const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
    if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
      return { ok: false, reason: 'email_taken' };
    }
    console.error('createAccountFromTelegram: createUser failed', error);
    return { ok: false, reason: 'failed' };
  }

  const userId = created.user.id;
  const now = new Date();
  const graceExpiresAt = expiryFrom(now);

  const { error: linkError } = await supabaseAdmin.from('telegram_accounts').insert({
    user_id: userId,
    tg_user_id: opts.tgUserId,
    chat_id: opts.chatId,
    tg_username: opts.username ?? null,
    created_in_telegram: true,
    grace_expires_at: graceExpiresAt.toISOString()
  });

  if (linkError) {
    // The auth user exists but is attached to nobody. Remove it rather
    // than leaving an orphan that silently holds the email address
    // hostage against the client's next attempt.
    console.error('createAccountFromTelegram: link insert failed, rolling back the user', linkError);
    await supabaseAdmin.auth.admin.deleteUser(userId).catch((err) =>
      console.error('createAccountFromTelegram: rollback delete failed', err)
    );
    return { ok: false, reason: 'failed' };
  }

  const issued = await issueSigninCode(userId);
  if (!issued) return { ok: false, reason: 'failed' };

  return { ok: true, code: issued.code, expiresAt: issued.expiresAt, userId };
}

/**
 * A fresh code for an account that has one already.
 *
 * Previous unused codes are spent, not left alongside it. Two live codes
 * for one account doubles what an attacker can guess at and means a code
 * read off an old message still works -- which is the opposite of what
 * "one-time" says on the message it came in.
 */
export async function issueSigninCode(userId: string): Promise<{ code: string; expiresAt: Date } | null> {
  const code = generateCode();
  const normalised = normaliseCode(code);
  if (!normalised) {
    console.error('issueSigninCode: generated a code that does not normalise -- this is a bug');
    return null;
  }
  const codeHash = await hashCode(normalised);
  const expiresAt = expiryFrom(new Date());

  await supabaseAdmin
    .from('tg_signin_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error } = await supabaseAdmin.from('tg_signin_codes').insert({
    code_hash: codeHash,
    user_id: userId,
    expires_at: expiresAt.toISOString()
  });

  if (error) {
    console.error(`issueSigninCode(${userId}) failed:`, error);
    return null;
  }
  return { code: formatCode(code), expiresAt };
}

/** The message carrying a code. One place, so the wording cannot drift. */
export function signinCodeMessage(code: string, opts: { firstTime: boolean }): string {
  return [
    opts.firstTime ? 'Your account is open.' : 'Here is a new sign-in code.',
    '',
    `Code: ${code}`,
    '',
    `Go to https://agenticcore.click/claim, enter your email and this code, and choose a password.`,
    `The code works once and lasts ${CODE_TTL_DAYS} days.`,
    '',
    'You can order from here in the meantime — you do not have to set the password first.',
    opts.firstTime
      ? `If you have not set one after ${CODE_TTL_DAYS} days the account pauses until you do. Nothing is lost.`
      : ''
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Conversation state
//
// One jsonb column per chat holding everything the bot is in the middle
// of: the signup it is collecting, the order awaiting a yes, and enough
// recent turns for the classifier to resolve "yes, that one". Read and
// written whole, because the three are small and a partial write is how
// confirming an order wipes the signup half-finished underneath it.

/** A quoted order waiting for the client to confirm it. */
export interface PendingOrder {
  sku: number;
  brief: string;
  details: Record<string, unknown>;
  productName: string;
  /** What it was quoted at. Re-computed before charging -- see tgClient. */
  quotedUsd: number;
  quotedAt: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatState {
  signup?: SignupState;
  pendingOrder?: PendingOrder | null;
  history?: ChatTurn[];
}

/** How much conversation the classifier gets. Enough to resolve a
    follow-up, short enough that a month-old chat is not re-sent every
    turn at full price. */
export const HISTORY_TURNS = 12;

export async function loadChatState(chatId: number): Promise<ChatState> {
  const { data, error } = await supabaseAdmin
    .from('tg_sessions')
    .select('state')
    .eq('chat_id', chatId)
    .maybeSingle<{ state: ChatState }>();
  if (error) {
    console.error(`loadChatState(${chatId}) failed:`, error);
    return {};
  }
  return data?.state ?? {};
}

export async function saveChatState(chatId: number, tgUserId: number, state: ChatState): Promise<void> {
  const trimmed: ChatState = {
    ...state,
    history: (state.history ?? []).slice(-HISTORY_TURNS)
  };
  const { error } = await supabaseAdmin.from('tg_sessions').upsert(
    {
      chat_id: chatId,
      tg_user_id: tgUserId,
      state: trimmed,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'chat_id' }
  );
  if (error) console.error(`saveChatState(${chatId}) failed:`, error);
}

export async function loadSignupState(chatId: number): Promise<SignupState> {
  const signup = (await loadChatState(chatId)).signup;
  return signup && typeof signup.step === 'string' ? signup : { step: 'idle' };
}

/**
 * Writes the signup half without touching the rest.
 *
 * Read-modify-write rather than a bare upsert of { signup }: the column
 * holds the pending order and the history too, and replacing it outright
 * would drop an order a client had already been quoted.
 */
export async function saveSignupState(chatId: number, tgUserId: number, signup: SignupState): Promise<void> {
  const state = await loadChatState(chatId);
  await saveChatState(chatId, tgUserId, { ...state, signup });
}

// ---------------------------------------------------------------------------

/** True only for the first delivery of an update Telegram may have retried. */
export async function claimUpdate(updateId: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('claim_telegram_update', { p_update_id: updateId });
  if (error) {
    // Fail open: a dedupe table that is briefly unreachable must not take
    // the whole bot down with it. A duplicated reply is a worse day than
    // a silent one, but not by as much as no bot at all.
    console.error(`claimUpdate(${updateId}) failed:`, error);
    return true;
  }
  return data === true;
}

/** Send a notice at most once, ever, for a given (kind, ref). */
export async function claimNotice(kind: string, ref: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from('tg_notices').insert({ kind, ref });
  if (error) return false;
  return true;
}
