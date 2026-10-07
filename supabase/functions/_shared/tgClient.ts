// The client side of the Telegram bot.
//
// Everything a non-owner can do in the chat. Separate from the webhook
// because the webhook's job is to turn an HTTP request into a (chat, who,
// text) and send a reply, and that is already a long file full of owner
// commands that have nothing to do with any of this.
//
// Opening an account, getting a sign-in code, knowing where you stand,
// and placing a real order -- quote, confirm, charge, queue.
//
// Ordering goes through _shared/placeOrder.ts, the same function the
// service pages and Forge use. The bot does not get its own copy of
// "take the money and make the task": the price is computed from the
// payload server-side here exactly as it is there, because a chat message
// is as much a client-controlled input as a browser request is.
import { supabaseAdmin } from './storage.ts';
import { expandSku, getSku } from './catalog.ts';
import { classifyClientMessage, type ClientIntent } from './clientConversation.ts';
import { describeOffer, clientCatalogue, suggestTopUp, TOPUP_TIERS, usd } from './orderOffer.ts';
import { createUsdtInvoice, tierForAmount } from './usdtInvoice.ts';
import { listAccountOrders } from './orders.ts';
import { calculatePriceUsd } from './pricing.ts';
import { placeOrder, walletBalance } from './placeOrder.ts';
import { CODE_TTL_DAYS, daysLeft } from './signinCode.ts';
import {
  claimNotice,
  createAccountFromTelegram,
  findAccountByTelegramId,
  issueSigninCode,
  loadChatState,
  loadSignupState,
  saveChatState,
  saveSignupState,
  signinCodeMessage,
  type ChatState,
  type PendingOrder,
  type TelegramAccount
} from './tgAccounts.ts';
import { signupTurn } from './tgSignup.ts';
import {
  backHome,
  briefPromptScreen,
  categoriesScreen,
  categoryScreen,
  confirmScreen,
  decode,
  homeScreen,
  walletScreen,
  type Keyboard,
  type Screen
} from './tgMenu.ts';

/**
 * What the bot sends back: words, and optionally buttons under them.
 *
 * Every handler returns this rather than a bare string, so adding
 * buttons to a screen is a change in one place instead of a change to
 * the webhook's idea of what a reply is.
 */
export interface Reply {
  text: string;
  keyboard?: Keyboard;
}

const asReply = (screen: Screen): Reply => ({ text: screen.text, keyboard: screen.keyboard });
const withMenu = (text: string): Reply => ({ text, keyboard: backHome() });

/** The price of a catalogue item, for the screens that list them. */
const priceOf = (item: { service: string; selector: Record<string, string> }) =>
  calculatePriceUsd(item.service, item.selector);

/** Home, built from whatever we know about this chat right now. */
async function homeFor(account: TelegramAccount | null): Promise<Reply> {
  if (!account) return asReply(homeScreen({ hasAccount: false }));
  return asReply(homeScreen({ hasAccount: true, balanceUsd: await walletBalance(account.userId) }));
}

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
  'Tell me what you need in your own words — "a logo for my bakery",',
  '"a 5-page website for a plumbing company" — and I will quote it.',
  '',
  '/services — everything we make, with prices',
  '/orders — your orders and where they are',
  '/wallet — your balance',
  '/topup — add money (USDT on BNB Smart Chain)',
  '/login — a fresh sign-in code for the website',
  '/account — your account and whether a password is set',
  '/help — this list',
  '/cancel — forget whatever I am in the middle of'
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


// ---------------------------------------------------------------------------
// Ordering

/**
 * How long a quote stands before it is re-quoted rather than charged.
 *
 * Not about price changes -- they are rare and the charge is recomputed
 * anyway. It is about a client who was quoted something on Monday, said
 * "yes" on Friday, and meant yes to a conversation they no longer
 * remember the contents of.
 */
const QUOTE_TTL_MINUTES = 60;

const YES = new Set(['yes', 'y', 'yeah', 'yep', 'ok', 'okay', 'sure', 'confirm', 'order it', 'go', 'go ahead', 'do it', 'buy it']);
const NO = new Set(['no', 'n', 'nope', 'cancel', 'stop', 'wait', 'nevermind', 'never mind', 'not yet']);

function quoteIsStale(order: PendingOrder, now: Date = new Date()): boolean {
  return now.getTime() - new Date(order.quotedAt).getTime() > QUOTE_TTL_MINUTES * 60 * 1000;
}

/** Turns a classified order into a quote the client can say yes to. */
async function quoteOrder(
  userId: string,
  intent: Extract<ClientIntent, { intent: 'order' }>
): Promise<{ reply: Reply; pending: PendingOrder | null }> {
  const item = getSku(intent.sku);
  if (!item || item.ownerOnly) {
    // The model picked a number outside the catalogue, or an owner-only
    // one. Never quote it: the supervisor would refuse the task later,
    // after the client had been charged and had waited.
    console.error(`quoteOrder: refused sku ${intent.sku}`);
    return { reply: asReply(categoriesScreen()), pending: null };
  }

  const expanded = expandSku(intent.sku, { ...(intent.details ?? {}), brief: intent.brief, description: intent.brief });
  if (!expanded) {
    return { reply: asReply(categoriesScreen()), pending: null };
  }

  const priceUsd = calculatePriceUsd(expanded.type, expanded.payload);
  if (priceUsd === null) {
    // A real product whose payload does not price is a missing choice --
    // most often a website with no tier. Ask rather than guess the
    // cheaper one, which would quote $10 for a $20 job.
    return {
      reply: withMenu(
        `For ${item.name} I need one more thing before I can quote it. ` +
          'How many pages, or which option did you want?'
      ),
      pending: null
    };
  }

  const balanceUsd = await walletBalance(userId);
  const offer = describeOffer({
    productName: item.name,
    priceUsd,
    balanceUsd,
    brief: intent.brief,
    revisions: item.revisions
  });

  return {
    reply: asReply(
      confirmScreen(offer.text, { affordable: offer.affordable, suggestedTopUpUsd: offer.suggestedTopUpUsd })
    ),
    pending: {
      sku: intent.sku,
      brief: intent.brief,
      details: intent.details ?? {},
      productName: item.name,
      quotedUsd: priceUsd,
      quotedAt: new Date().toISOString()
    }
  };
}

/**
 * Charges and queues a quote the client has just confirmed.
 *
 * Returns the quote to keep open, if any: a re-quote at a changed price
 * and a wallet that came up short both need the order still there for
 * the next YES, and clearing it would make "say YES again" a dead end.
 */
async function confirmOrder(
  userId: string,
  order: PendingOrder
): Promise<{ reply: string; keep: PendingOrder | null }> {
  const expanded = expandSku(order.sku, { ...order.details, brief: order.brief, description: order.brief });
  if (!expanded) return { reply: 'Something went wrong with that order. Please describe it again.', keep: null };

  // Priced again from the payload, not taken from the quote. The quote is
  // a message the client was shown; it is not an authority on what
  // anything costs, and treating it as one is how a stale or tampered
  // number becomes the charge.
  //
  // But a client who says yes to one figure must not be charged another,
  // so if the two disagree the order stops and is re-quoted. Rare -- it
  // takes a price change between the quote and the yes -- and the one
  // case where being slow is obviously right.
  const livePrice = calculatePriceUsd(expanded.type, expanded.payload);
  if (livePrice !== null && Math.round(livePrice * 100) !== Math.round(order.quotedUsd * 100)) {
    console.warn(`confirmOrder: ${order.productName} quoted at ${order.quotedUsd}, now ${livePrice}`);
    return {
      reply: [
        `${order.productName} is ${usd(livePrice)} now, not the ${usd(order.quotedUsd)} I quoted you.`,
        '',
        'I have not charged anything. Say YES again if the new price is fine.'
      ].join('\n'),
      // Re-quoted at the real price and the clock restarted, so the next
      // YES is a yes to the number they have just been shown.
      keep: { ...order, quotedUsd: livePrice, quotedAt: new Date().toISOString() }
    };
  }

  const result = await placeOrder({
    userId,
    type: expanded.type,
    payload: expanded.payload,
    source: 'telegram'
  });

  if (!result.ok) {
    if (result.reason === 'insufficient_funds') {
      const balance = await walletBalance(userId);
      const short = Math.max(0, (result.priceUsd ?? 0) - balance);
      return {
        reply: [
          `Not enough in the wallet — ${order.productName} is ${usd(result.priceUsd ?? 0)} and you have ${usd(balance)}.`,
          '',
          `Send /topup ${suggestTopUp(short)} and I will give you an address, then say YES again.`
        ].join('\n'),
        // Held open on purpose: they are about to top up and come back,
        // and making them describe the whole thing again after paying is
        // the point at which people give up.
        keep: { ...order, quotedAt: new Date().toISOString() }
      };
    }
    return { reply: result.message, keep: null };
  }

  return {
    reply: [
      `Ordered — ${result.publicId}.`,
      '',
      `${result.productName}, ${usd(result.priceUsd)} taken from your wallet.`,
      `Wallet now: ${usd(await walletBalance(userId))}`,
      '',
      'I will message you here the moment it is ready, and it lands in your',
      'dashboard at the same time. Send /orders to check on it.'
    ].join('\n'),
    keep: null
  };
}

async function describeOrders(userId: string): Promise<string> {
  const orders = await listAccountOrders(userId, 10);
  if (orders.length === 0) {
    return 'You have not ordered anything yet. Tell me what you need, or send /services for the list.';
  }
  const lines = orders.map((order) => {
    const files = order.files > 0 ? `, ${order.files} file${order.files === 1 ? '' : 's'}` : '';
    return `${order.publicId} — ${order.product}: ${order.status.replace(/_/g, ' ')}${files}`;
  });
  return ['Your orders, newest first:', '', ...lines, '', 'Files are in your dashboard: https://agenticcore.click/dashboard'].join('\n');
}

async function describeWallet(userId: string): Promise<string> {
  const balance = await walletBalance(userId);
  return [
    `Wallet: ${usd(balance)}`,
    '',
    balance > 0 ? 'Tell me what you need and I will quote it.' : 'Send /topup to add funds.'
  ].join('\n');
}

/**
 * A real invoice, in the chat.
 *
 * Not a link to the dashboard: a client who opened their account here has
 * no website password yet, so sending them to Billing to pay is sending
 * them to a login screen. The invoice is the same one the dashboard opens
 * -- same function, same nonce allocation, same chain-height bound.
 */
async function handleTopUp(userId: string, amountUsd?: number): Promise<string> {
  if (!amountUsd || amountUsd <= 0) {
    return [
      'How much would you like to add?',
      '',
      ...TOPUP_TIERS.map((tier) => `/topup ${tier} — ${usd(tier)}`),
      '',
      'Paid in USDT on BNB Smart Chain (BEP-20).'
    ].join('\n');
  }

  const tier = tierForAmount(amountUsd);
  if (!tier) {
    return [
      `${usd(amountUsd)} is not one of the amounts we take.`,
      '',
      ...TOPUP_TIERS.map((t) => `/topup ${t} — ${usd(t)}`)
    ].join('\n');
  }

  const result = await createUsdtInvoice(userId, tier);
  if (!result.ok) return result.error;

  const { invoice } = result;
  const minutes = Math.max(1, Math.round((new Date(invoice.expiresAt).getTime() - Date.now()) / 60000));

  return [
    `To add ${usd(invoice.creditUsd)}, send exactly:`,
    '',
    `${invoice.amount} USDT`,
    '',
    'to this address on BNB Smart Chain (BEP-20):',
    '',
    invoice.address,
    '',
    'The amount is how I know the payment is yours — there is one address',
    'and no memo field — so send it to the last decimal place, not rounded.',
    '',
    `This invoice is good for ${minutes} minutes. I will message you here as`,
    'soon as it confirms, usually within a minute of you sending it.'
  ].join('\n');
}

/**
 * Handles one message from somebody who is not the owner.
 *
 * Returns the text to send back. Never throws: the caller is a webhook,
 * and a thrown error there is a message Telegram retries forever.
 */
export async function routeClientMessage(message: IncomingClientMessage): Promise<Reply> {
  const { chatId, tgUserId, username, text } = message;
  const command = text.trim().toLowerCase().split(/\s+/)[0];

  let account: TelegramAccount | null;
  try {
    account = await findAccountByTelegramId(tgUserId);
  } catch (err) {
    console.error('routeClientMessage: account lookup failed', err);
    return { text: 'Something went wrong on our side. Please try again in a moment.' };
  }

  // --- somebody we already know -------------------------------------------
  if (account) {
    return handleClientTurn(account, chatId, tgUserId, text, command);
  }

  // --- somebody new --------------------------------------------------------
  const state = await loadSignupState(chatId);

  // A stranger sending /start gets the buttons, not a wall of commands
  // they have no account to use.
  if ((command === '/start' || command === '/menu' || command === '/help') && state.step === 'idle') {
    return homeFor(null);
  }

  // /login before there is an account is the single most likely wrong turn
  // here, and "unknown command" would be a dead end for the person it
  // happens to.
  if ((command === '/login' || command === '/account') && state.step === 'idle') {
    await saveSignupState(chatId, tgUserId, { step: 'email' });
    return { text: `You do not have an account yet — let us fix that.\n\n${signupTurn({ step: 'idle' }, '/start').reply}` };
  }

  const turn = signupTurn(state, text);

  if (turn.action === 'create') {
    const email = state.email;
    if (!email) {
      // Cannot happen through the state machine, but an empty email here
      // would create an account nobody can ever sign in to.
      await saveSignupState(chatId, tgUserId, { step: 'email' });
      return { text: 'I lost track of your email address. What is it?' };
    }

    const result = await createAccountFromTelegram({ tgUserId, chatId, username, email });
    await saveSignupState(chatId, tgUserId, { step: 'idle' });

    if (result.ok) {
      return { text: signinCodeMessage(result.code, { firstTime: true }), keyboard: backHome() };
    }
    switch (result.reason) {
      case 'email_taken':
        return withMenu([
          `${email} already has an account.`,
          '',
          'Sign in at https://agenticcore.click/login with that address.',
          'If it is yours and you cannot get in, use "forgot password" there,',
          'or write to hello@agenticcore.click.',
          '',
          'To open a separate account here, send a different email address.'
        ].join('\n'));
      case 'already_linked':
        return withMenu('This Telegram account is already connected to an account.');
      default:
        return withMenu('Could not open the account just now. Please try again in a moment.');
    }
  }

  await saveSignupState(chatId, tgUserId, turn.state);
  return { text: turn.reply };
}


/**
 * A message from a client with an account.
 *
 * Slash commands first, deterministically -- a client who types /orders
 * gets their orders, not a model's opinion of what /orders might mean.
 * Everything else goes to the classifier, except a bare yes or no while
 * a quote is open, which is answered here because "yes" is the one word
 * that must never be re-interpreted.
 */
async function handleClientTurn(
  account: TelegramAccount,
  chatId: number,
  tgUserId: number,
  text: string,
  command: string
): Promise<Reply> {
  const state = await loadChatState(chatId);

  switch (command) {
    case '/login':
    case '/signin':
      return withMenu(await handleLogin(account));
    case '/account':
    case '/me':
      return withMenu(await describeAccount(account));
    case '/services':
    case '/catalog':
    case '/catalogue':
      return asReply(categoriesScreen());
    case '/orders':
      return withMenu(await describeOrders(account.userId));
    case '/wallet':
    case '/balance':
      return asReply(walletScreen(await walletBalance(account.userId), TOPUP_TIERS));
    case '/topup': {
      const amount = Number(text.trim().split(/\s+/)[1]);
      if (Number.isFinite(amount) && amount > 0) {
        return withMenu(await handleTopUp(account.userId, amount));
      }
      return asReply(walletScreen(await walletBalance(account.userId), TOPUP_TIERS));
    }
    case '/start':
    case '/help':
    case '/menu':
      return homeFor(account);
    case '/cancel':
      await saveChatState(chatId, tgUserId, {
        ...state,
        signup: { step: 'idle' },
        pendingOrder: null,
        awaitingBriefForSku: null
      });
      return homeFor(account);
  }

  const lower = text.trim().toLowerCase();
  const pending = state.pendingOrder ?? null;

  // A brief for a product picked from the buttons.
  //
  // Checked before the classifier, because the product is already decided
  // -- sending "a bakery, warm and handmade" to a model that might read it
  // as a different product is how a tap on Logo becomes an order for a
  // brand kit.
  if (state.awaitingBriefForSku) {
    const quote = await quoteSku(account.userId, state.awaitingBriefForSku, text.trim());
    await saveChatState(chatId, tgUserId, {
      ...state,
      awaitingBriefForSku: null,
      pendingOrder: quote.pending,
      history: appendTurns(state, text, quote.reply.text)
    });
    return quote.reply;
  }

  // A yes against an open quote is the one input that spends money, so it
  // is matched against a fixed list here rather than classified. A model
  // that reads "no, not that one" as a confirmation is a model that
  // charged somebody.
  if (pending && YES.has(lower)) {
    return settlePending(account, chatId, tgUserId, state, pending, text);
  }

  if (pending && NO.has(lower)) {
    await saveChatState(chatId, tgUserId, { ...state, pendingOrder: null });
    return homeFor(account);
  }

  const intent = await classifyClientMessage(text, state.history ?? []);

  let reply: Reply;
  let nextPending: PendingOrder | null = pending;

  switch (intent.intent) {
    case 'order': {
      const quote = await quoteOrder(account.userId, intent);
      reply = quote.reply;
      nextPending = quote.pending;
      break;
    }
    case 'catalogue':
      reply = asReply(categoriesScreen());
      break;
    case 'orders':
      reply = withMenu(await describeOrders(account.userId));
      break;
    case 'wallet':
      reply = asReply(walletScreen(await walletBalance(account.userId), TOPUP_TIERS));
      break;
    case 'topup':
      reply = intent.amountUsd
        ? withMenu(await handleTopUp(account.userId, intent.amountUsd))
        : asReply(walletScreen(await walletBalance(account.userId), TOPUP_TIERS));
      break;
    case 'ask':
      reply = { text: intent.question };
      break;
    case 'chat':
      reply = { text: intent.reply };
      break;
    default:
      reply = await homeFor(account);
  }

  await saveChatState(chatId, tgUserId, {
    ...state,
    pendingOrder: nextPending,
    history: appendTurns(state, text, reply.text)
  });
  return reply;
}

/** Shared by the typed YES and the Confirm button -- one path to a charge. */
async function settlePending(
  account: TelegramAccount,
  chatId: number,
  tgUserId: number,
  state: ChatState,
  pending: PendingOrder,
  trigger: string
): Promise<Reply> {
  if (quoteIsStale(pending)) {
    await saveChatState(chatId, tgUserId, { ...state, pendingOrder: null });
    return withMenu(
      [
        `That quote for ${pending.productName} is over an hour old, so I will not charge it blind.`,
        '',
        'Tell me what you need again and I will re-quote it.'
      ].join('\n')
    );
  }

  const { reply, keep } = await confirmOrder(account.userId, pending);
  await saveChatState(chatId, tgUserId, {
    ...state,
    pendingOrder: keep,
    history: appendTurns(state, trigger, reply)
  });
  return withMenu(reply);
}

/**
 * A quote for a product chosen from the buttons.
 *
 * Separate from quoteOrder, which starts from a model's reading of free
 * text. Here the product is not in question -- only the brief is -- so
 * nothing re-decides it.
 */
async function quoteSku(
  userId: string,
  sku: number,
  brief: string
): Promise<{ reply: Reply; pending: PendingOrder | null }> {
  const item = getSku(sku);
  if (!item || item.ownerOnly) {
    return { reply: await homeFor(null), pending: null };
  }

  const expanded = expandSku(sku, { brief, description: brief });
  const priceUsd = expanded ? calculatePriceUsd(expanded.type, expanded.payload) : null;
  if (!expanded || priceUsd === null) {
    return {
      reply: withMenu(`I could not price ${item.name} from that. Try the menu again.`),
      pending: null
    };
  }

  const balanceUsd = await walletBalance(userId);
  const offer = describeOffer({
    productName: item.name,
    priceUsd,
    balanceUsd,
    brief,
    revisions: item.revisions
  });

  return {
    reply: asReply(
      confirmScreen(offer.text, { affordable: offer.affordable, suggestedTopUpUsd: offer.suggestedTopUpUsd })
    ),
    pending: {
      sku,
      brief,
      details: {},
      productName: item.name,
      quotedUsd: priceUsd,
      quotedAt: new Date().toISOString()
    }
  };
}

function appendTurns(state: ChatState, userText: string, assistantText: string): ChatState['history'] {
  return [
    ...(state.history ?? []),
    { role: 'user' as const, content: userText },
    { role: 'assistant' as const, content: assistantText }
  ];
}


/**
 * Somebody tapped a button.
 *
 * Mirrors routeClientMessage: same account lookup, same screens, same
 * state. The two are separate entry points into one set of handlers,
 * rather than a button path that quietly does something slightly
 * different from the typed one -- which is how a Confirm button ends up
 * charging on a rule the typed YES does not follow.
 */
export async function routeClientCallback(message: {
  chatId: number;
  tgUserId: number;
  username?: string;
  data: string;
}): Promise<Reply> {
  const { chatId, tgUserId, data } = message;
  const action = decode(data);

  let account: TelegramAccount | null;
  try {
    account = await findAccountByTelegramId(tgUserId);
  } catch (err) {
    console.error('routeClientCallback: account lookup failed', err);
    return { text: 'Something went wrong on our side. Please try again in a moment.' };
  }

  // Everything below the front door needs an account. A stranger tapping
  // a product gets offered one rather than an error.
  if (!account && action.kind !== 'signup' && action.kind !== 'categories' && action.kind !== 'home') {
    return homeFor(null);
  }

  const state = await loadChatState(chatId);

  switch (action.kind) {
    case 'home':
      return homeFor(account);

    case 'signup':
      await saveSignupState(chatId, tgUserId, { step: 'email' });
      return { text: signupTurn({ step: 'idle' }, '/start').reply };

    case 'categories':
      return asReply(categoriesScreen());

    case 'category':
      return asReply(categoryScreen(action.service, priceOf));

    case 'product': {
      const item = getSku(action.sku);
      const expanded = item ? expandSku(action.sku, {}) : null;
      const price = expanded ? calculatePriceUsd(expanded.type, expanded.payload) : null;
      if (!item || price === null) return asReply(categoriesScreen());

      // Remember the product, then ask for the one thing a button cannot
      // carry. Any pending quote is dropped: they have moved on.
      await saveChatState(chatId, tgUserId, { ...state, awaitingBriefForSku: action.sku, pendingOrder: null });
      return asReply(briefPromptScreen(item, price));
    }

    case 'bundle':
      return withMenu(
        [
          'Full Business Setup — $20',
          '',
          'A website, 15 images, 5 logo options, 3 documents, 3 short videos,',
          'a social kit and a brand-kit piece.',
          '',
          'It takes a few answers to set up, so it is easiest on the website:',
          'https://agenticcore.click/dashboard',
          '',
          'Or just tell me your business name and what it does, and I will',
          'take it from there.'
        ].join('\n')
      );

    case 'wallet':
      return asReply(walletScreen(await walletBalance(account!.userId), TOPUP_TIERS));

    case 'topup':
      return withMenu(await handleTopUp(account!.userId, action.amountUsd));

    case 'orders':
      return withMenu(await describeOrders(account!.userId));

    case 'account':
      return withMenu(await describeAccount(account!));

    case 'login':
      return withMenu(await handleLogin(account!));

    case 'confirm': {
      const pending = state.pendingOrder ?? null;
      if (!pending) {
        // The button outlived its quote -- a tap on an old message, or a
        // second tap on one already acted on. Not an error worth a scary
        // word; just show them where they are.
        return homeFor(account);
      }
      return settlePending(account!, chatId, tgUserId, state, pending, '(tapped Confirm)');
    }

    case 'cancel':
      await saveChatState(chatId, tgUserId, { ...state, pendingOrder: null, awaitingBriefForSku: null });
      return homeFor(account);

    default:
      return homeFor(account);
  }
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
