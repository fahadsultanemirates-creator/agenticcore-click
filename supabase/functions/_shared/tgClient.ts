// The client side of the Telegram bot.
//
// Everything a non-owner can do in the chat. Separate from the webhook
// because the webhook's job is to turn an HTTP request into a (chat, who,
// text) and send a reply, and that is already a long file full of owner
// commands that have nothing to do with any of this.
//
// Phase one: opening an account, getting a sign-in code, and knowing where
// you stand. Ordering from the chat is the next piece; until then the menu
// says so rather than offering something that is not there.
import { supabaseAdmin } from './storage.ts';
import { CODE_TTL_DAYS, daysLeft } from './signinCode.ts';
import {
  claimNotice,
  createAccountFromTelegram,
  findAccountByTelegramId,
  issueSigninCode,
  loadSignupState,
  saveSignupState,
  signinCodeMessage,
  type TelegramAccount
} from './tgAccounts.ts';
import { signupTurn } from './tgSignup.ts';

export interface IncomingClientMessage {
  chatId: number;
  tgUserId: number;
  username?: string;
  text: string;
}

/**
 * Three codes an hour.
 *
 * A code is a credential sent to whoever holds the Telegram account, so
 * the limit is not really about abuse from outside -- it is that a chat
 * full of live codes is a chat where the newest one is hard to find, and
 * every reissue invalidates the last.
 */
const CODES_PER_HOUR = 3;

const MENU = [
  'What I can do:',
  '',
  '/login — a fresh sign-in code for the website',
  '/account — your account and whether a password is set',
  '/help — this list',
  '/cancel — stop whatever I am in the middle of asking',
  '',
  'Ordering from this chat is coming next. For now, everything is at',
  'https://agenticcore.click/dashboard'
].join('\n');

async function codesIssuedLastHour(userId: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('tg_signin_codes')
    .select('code_hash', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) {
    console.error(`codesIssuedLastHour(${userId}) failed:`, error);
    // Fail closed on the rate limit: a counter we cannot read is not a
    // reason to hand out unlimited credentials.
    return CODES_PER_HOUR;
  }
  return count ?? 0;
}

async function describeAccount(account: TelegramAccount): Promise<string> {
  const { data } = await supabaseAdmin
    .from('client_accounts')
    .select('account_no')
    .eq('user_id', account.userId)
    .maybeSingle<{ account_no: number }>();

  const { data: wallet } = await supabaseAdmin
    .from('wallets')
    .select('balance_usd')
    .eq('user_id', account.userId)
    .maybeSingle<{ balance_usd: number }>();

  const lines = [
    data?.account_no ? `Account ${data.account_no}` : 'Account opened — your number is assigned with your first order.',
    `Wallet: $${Number(wallet?.balance_usd ?? 0).toFixed(2)}`
  ];

  if (account.passwordSetAt) {
    lines.push('Password: set. You can sign in at https://agenticcore.click/login');
  } else if (account.pausedAt) {
    lines.push(
      'Password: not set, and the 30 days ran out — new orders are paused.',
      'Send /login for a code and set one. Nothing has been deleted.'
    );
  } else if (account.graceExpiresAt) {
    const left = daysLeft(account.graceExpiresAt);
    lines.push(
      `Password: not set. ${left} day${left === 1 ? '' : 's'} left to choose one.`,
      'Send /login for a code.'
    );
  }

  return lines.join('\n');
}

async function handleLogin(account: TelegramAccount): Promise<string> {
  if (await codesIssuedLastHour(account.userId) >= CODES_PER_HOUR) {
    return (
      `That is ${CODES_PER_HOUR} codes in an hour, which is as many as I send. ` +
      'Use the most recent one, or try again shortly.\n\n' +
      'If none of them worked, write to hello@agenticcore.click.'
    );
  }
  const issued = await issueSigninCode(account.userId);
  if (!issued) return 'Could not generate a code just now. Please try again in a moment.';
  return signinCodeMessage(issued.code, { firstTime: false });
}

/**
 * Handles one message from somebody who is not the owner.
 *
 * Returns the text to send back. Never throws: the caller is a webhook,
 * and a thrown error there is a message Telegram retries forever.
 */
export async function routeClientMessage(message: IncomingClientMessage): Promise<string> {
  const { chatId, tgUserId, username, text } = message;
  const command = text.trim().toLowerCase().split(/\s+/)[0];

  let account: TelegramAccount | null;
  try {
    account = await findAccountByTelegramId(tgUserId);
  } catch (err) {
    console.error('routeClientMessage: account lookup failed', err);
    return 'Something went wrong on our side. Please try again in a moment.';
  }

  // --- somebody we already know -------------------------------------------
  if (account) {
    switch (command) {
      case '/login':
      case '/signin':
        return handleLogin(account);
      case '/account':
      case '/me':
        return describeAccount(account);
      case '/start':
      case '/help':
      case '/menu':
        return `${await describeAccount(account)}\n\n${MENU}`;
      case '/cancel':
        await saveSignupState(chatId, tgUserId, { step: 'idle' });
        return 'Nothing in progress.';
      default:
        return MENU;
    }
  }

  // --- somebody new --------------------------------------------------------
  const state = await loadSignupState(chatId);

  // /login before there is an account is the single most likely wrong turn
  // here, and "unknown command" would be a dead end for the person it
  // happens to.
  if ((command === '/login' || command === '/account') && state.step === 'idle') {
    await saveSignupState(chatId, tgUserId, { step: 'email' });
    return `You do not have an account yet — let us fix that.\n\n${signupTurn({ step: 'idle' }, '/start').reply}`;
  }

  const turn = signupTurn(state, text);

  if (turn.action === 'create') {
    const email = state.email;
    if (!email) {
      // Cannot happen through the state machine, but an empty email here
      // would create an account nobody can ever sign in to.
      await saveSignupState(chatId, tgUserId, { step: 'email' });
      return 'I lost track of your email address. What is it?';
    }

    const result = await createAccountFromTelegram({ tgUserId, chatId, username, email });
    await saveSignupState(chatId, tgUserId, { step: 'idle' });

    if (result.ok) {
      return signinCodeMessage(result.code, { firstTime: true });
    }
    switch (result.reason) {
      case 'email_taken':
        return [
          `${email} already has an account.`,
          '',
          'Sign in at https://agenticcore.click/login with that address.',
          'If it is yours and you cannot get in, use "forgot password" there,',
          'or write to hello@agenticcore.click.',
          '',
          'To open a separate account here, send a different email address.'
        ].join('\n');
      case 'already_linked':
        return 'This Telegram account is already connected to an account. Send /account.';
      default:
        return 'Could not open the account just now. Please try again in a moment.';
    }
  }

  await saveSignupState(chatId, tgUserId, turn.state);
  return turn.reply;
}

/**
 * The hourly sweep: day-23 and day-29 reminders, then pausing whatever ran
 * out. Returns the messages to send, rather than sending them, so the
 * decision of what to say is testable and the sending stays in one place.
 */
export async function accountRemindersDue(now: Date = new Date()): Promise<{ chatId: number; text: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('telegram_accounts')
    .select('user_id, chat_id, grace_expires_at')
    .is('password_set_at', null)
    .is('paused_at', null)
    .not('grace_expires_at', 'is', null);

  if (error) {
    console.error('accountRemindersDue failed:', error);
    return [];
  }

  const due: { chatId: number; text: string }[] = [];
  for (const row of (data ?? []) as { user_id: string; chat_id: number; grace_expires_at: string }[]) {
    const left = daysLeft(row.grace_expires_at, now);
    // Day 23 and day 29 of 30, i.e. 7 days left and 1 day left.
    const milestone = left === 7 ? 'day23' : left === 1 ? 'day29' : null;
    if (!milestone) continue;
    if (!(await claimNotice(milestone, row.user_id))) continue;

    due.push({
      chatId: Number(row.chat_id),
      text: [
        left === 1
          ? 'Your account pauses tomorrow unless you set a password.'
          : `${left} days left to set a password on your account.`,
        '',
        'Send /login for a code, then set one at https://agenticcore.click/claim.',
        '',
        'Nothing is deleted when it pauses — you just cannot place new orders',
        'until a password exists, because without one there is no way back',
        'into the account if you lose this Telegram.'
      ].join('\n')
    });
  }
  return due;
}

export const PAUSED_NOTICE = [
  'Your account is now paused: 30 days passed without a password being set.',
  '',
  'Nothing has been deleted. Send /login for a code and set a password at',
  'https://agenticcore.click/claim, and it unpauses immediately.'
].join('\n');

export { CODE_TTL_DAYS };
