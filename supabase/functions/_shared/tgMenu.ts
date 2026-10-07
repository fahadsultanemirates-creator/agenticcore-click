// The button tree, as data.
//
// Telegram buttons carry a `callback_data` string of at most 64 BYTES,
// and that string is the only thing coming back when somebody taps. So
// every screen in the bot is identified by a short code here, and every
// tap is parsed back into one. Pure, because a mistyped code is a button
// that silently does nothing, which is the hardest kind of bug to notice
// in a chat.
//
// Buttons are for navigating. Words are still for the brief: no grid of
// buttons can express "warm and handmade, for a bakery called Pixel &
// Pine", so picking a product asks for that in text. Tap to find the
// thing, type the one sentence only you can write.
import { CATALOG, type CatalogItem } from './catalog.ts';

/** Telegram's hard limit on callback_data. Exceeding it is a silent failure. */
export const MAX_CALLBACK_BYTES = 64;

export interface Button {
  text: string;
  /** A callback code, or a URL for a link button. */
  data?: string;
  url?: string;
}

/** Rows of buttons, as Telegram wants them. */
export type Keyboard = Button[][];

export interface Screen {
  text: string;
  keyboard: Keyboard;
}

// ---------------------------------------------------------------------------
// Callback codes
//
// Short on purpose. `c:brand-kit` is 12 bytes; the same screen named
// `category:brand-marketing-kit` is 28, and the budget is shared with
// everything else a code may need to carry.

export type Action =
  | { kind: 'home' }
  | { kind: 'categories' }
  | { kind: 'category'; service: string }
  | { kind: 'product'; sku: number }
  | { kind: 'bundle' }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'wallet' }
  | { kind: 'topup'; amountUsd: number }
  | { kind: 'orders' }
  | { kind: 'account' }
  | { kind: 'signup' }
  | { kind: 'login' }
  | { kind: 'unknown' };

export function encode(action: Action): string {
  switch (action.kind) {
    case 'home': return 'h';
    case 'categories': return 'cc';
    case 'category': return `c:${action.service}`;
    case 'product': return `p:${action.sku}`;
    case 'bundle': return 'bun';
    case 'confirm': return 'ok';
    case 'cancel': return 'x';
    case 'wallet': return 'w';
    case 'topup': return `t:${action.amountUsd}`;
    case 'orders': return 'o';
    case 'account': return 'a';
    case 'signup': return 'su';
    case 'login': return 'li';
    default: return 'h';
  }
}

/**
 * A tap, read back.
 *
 * Unknown rather than a throw: a button from a message sent before a
 * deploy is a real thing a client will tap, and the answer to that is to
 * show them the menu again, not to crash the webhook.
 */
export function decode(data: string): Action {
  const [head, rest] = data.split(':', 2);
  switch (head) {
    case 'h': return { kind: 'home' };
    case 'cc': return { kind: 'categories' };
    case 'c': return rest ? { kind: 'category', service: rest } : { kind: 'unknown' };
    case 'p': {
      // The empty check is not redundant: Number('') is 0, and 0 is an
      // integer, so a bare "p:" decoded as a real product with sku 0.
      if (!rest) return { kind: 'unknown' };
      const sku = Number(rest);
      return Number.isInteger(sku) && sku > 0 ? { kind: 'product', sku } : { kind: 'unknown' };
    }
    case 'bun': return { kind: 'bundle' };
    case 'ok': return { kind: 'confirm' };
    case 'x': return { kind: 'cancel' };
    case 'w': return { kind: 'wallet' };
    case 't': {
      if (!rest) return { kind: 'unknown' };
      const amount = Number(rest);
      return Number.isFinite(amount) && amount > 0 ? { kind: 'topup', amountUsd: amount } : { kind: 'unknown' };
    }
    case 'o': return { kind: 'orders' };
    case 'a': return { kind: 'account' };
    case 'su': return { kind: 'signup' };
    case 'li': return { kind: 'login' };
    default: return { kind: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// Screens

export const CATEGORIES: { service: string; label: string }[] = [
  { service: 'website', label: 'Websites' },
  { service: 'pdf', label: 'Print & design' },
  { service: 'image', label: 'Images' },
  { service: 'video', label: 'Video' },
  { service: 'social', label: 'Social media' },
  { service: 'documents', label: 'Business documents' },
  { service: 'brand-kit', label: 'Brand & marketing kit' }
];

export function homeScreen(opts: { hasAccount: boolean; balanceUsd?: number }): Screen {
  if (!opts.hasAccount) {
    return {
      text: [
        'Websites, logos, brochures, short videos, social packs — made for',
        'your business and sent back here, usually within the hour.',
        '',
        'Opening an account takes one thing: an email address.'
      ].join('\n'),
      keyboard: [
        [{ text: 'Open an account', data: encode({ kind: 'signup' }) }],
        [{ text: 'See what we make', data: encode({ kind: 'categories' }) }]
      ]
    };
  }

  return {
    text: [
      `Wallet: $${(opts.balanceUsd ?? 0).toFixed(2)}`,
      '',
      'What would you like?'
    ].join('\n'),
    keyboard: [
      [{ text: 'Order a service', data: encode({ kind: 'categories' }) }],
      [{ text: 'Full Business Setup — $20', data: encode({ kind: 'bundle' }) }],
      [{ text: 'Packages / top up wallet', data: encode({ kind: 'wallet' }) }],
      [
        { text: 'My orders', data: encode({ kind: 'orders' }) },
        { text: 'My account', data: encode({ kind: 'account' }) }
      ]
    ]
  };
}

/**
 * The moment just after an account is created.
 *
 * The one screen a brand-new client sees, and the one that was wrong: it
 * handed over a code and said nothing about what to do, so a new user had
 * to go hunting for /packages on their own. Buttons, in the order they
 * are needed.
 */
export function justSignedUpScreen(codeMessage: string): Screen {
  return {
    text: codeMessage,
    keyboard: [
      [{ text: 'Add funds to start', data: encode({ kind: 'wallet' }) }],
      [{ text: 'See what we make', data: encode({ kind: 'categories' }) }]
    ]
  };
}

export function categoriesScreen(): Screen {
  return {
    text: 'What kind of thing do you need?',
    keyboard: [
      // Two per row: seven one-per-row buttons is most of a phone screen,
      // and these labels are short enough to pair.
      ...pairs(CATEGORIES.map((c) => ({ text: c.label, data: encode({ kind: 'category', service: c.service }) }))),
      [{ text: '‹ Back', data: encode({ kind: 'home' }) }]
    ]
  };
}

/**
 * The products in one category, priced.
 *
 * Owner-only products and anything the pricer cannot price are left out --
 * a button that quotes nothing is a button that charges nothing.
 */
export function categoryScreen(
  service: string,
  priceOf: (item: CatalogItem) => number | null
): Screen {
  const label = CATEGORIES.find((c) => c.service === service)?.label ?? service;
  const items = CATALOG.filter((item) => item.service === service && !item.ownerOnly && priceOf(item) !== null);

  if (items.length === 0) {
    return {
      text: `Nothing available under ${label} right now.`,
      keyboard: [[{ text: '‹ Back', data: encode({ kind: 'categories' }) }]]
    };
  }

  return {
    text: `${label} — pick one:`,
    keyboard: [
      ...items.map((item) => [
        { text: `${item.name} — $${priceOf(item)!.toFixed(2)}`, data: encode({ kind: 'product', sku: item.sku }) }
      ]),
      [{ text: '‹ Back', data: encode({ kind: 'categories' }) }]
    ]
  };
}

/** After picking a product: the one thing buttons cannot collect. */
export function briefPromptScreen(item: CatalogItem, priceUsd: number): Screen {
  return {
    text: [
      `${item.name} — $${priceUsd.toFixed(2)}`,
      item.revisions > 0
        ? `Includes ${item.revisions} revision${item.revisions === 1 ? '' : 's'}.`
        : 'No revisions — this comes back as options to choose from.',
      '',
      'Tell me about it in a line or two: the business name, what it does,',
      'and any style or colour you want. You can send a voice note instead.'
    ].join('\n'),
    keyboard: [[{ text: '‹ Back', data: encode({ kind: 'category', service: item.service }) }]]
  };
}

export function confirmScreen(text: string, opts: { affordable: boolean; suggestedTopUpUsd: number }): Screen {
  return {
    text,
    keyboard: opts.affordable
      ? [
          [{ text: 'Confirm and order', data: encode({ kind: 'confirm' }) }],
          [{ text: 'Cancel', data: encode({ kind: 'cancel' }) }]
        ]
      : [
          [{ text: `Top up $${opts.suggestedTopUpUsd}`, data: encode({ kind: 'topup', amountUsd: opts.suggestedTopUpUsd }) }],
          [{ text: 'Cancel', data: encode({ kind: 'cancel' }) }]
        ]
  };
}

/**
 * The packages, with what each one actually buys you.
 *
 * "$100" on its own is a number, not an offer. The website's cards carry
 * each tier's standing discount and they are most of the reason to pick
 * a bigger one, so the buttons carry them too -- a client choosing in a
 * chat should not be deciding on less information than one choosing on
 * the site.
 */
/**
 * After an invoice is issued.
 *
 * The payment details are above this; what was missing is the sentence
 * that says the client's job is finished. Without it somebody sends the
 * money and then sits in a chat wondering whether they were supposed to
 * confirm something.
 */
export function invoiceIssuedScreen(details: string): Screen {
  return {
    text: details,
    keyboard: [
      [{ text: 'See what we make', data: encode({ kind: 'categories' }) }],
      [{ text: 'A different amount', data: encode({ kind: 'wallet' }) }],
      [{ text: '‹ Menu', data: encode({ kind: 'home' }) }]
    ]
  };
}

export function walletScreen(
  balanceUsd: number,
  packages: readonly { amountUsd: number; routineDiscount: number; firstOrderDiscount: number }[]
): Screen {
  const firstOrder = packages.map((p) => `${p.firstOrderDiscount}% on $${p.amountUsd}`).join(', ');

  return {
    text: [
      `Wallet: $${balanceUsd.toFixed(2)}`,
      '',
      'Top up and the tier sets a discount on every order you place, for good:',
      '',
      ...packages.map((p) =>
        p.routineDiscount > 0
          ? `$${p.amountUsd} — ${p.routineDiscount}% off every order`
          : `$${p.amountUsd} — no standing discount (minimum to start)`
      ),
      '',
      `Your first order after your first top-up is discounted too — ${firstOrder}.`,
      'That one applies to everything, the $20 Full Business Setup included,',
      'and it applies once.',
      '',
      'Paid in USDT on BNB Smart Chain.'
    ].join('\n'),
    keyboard: [
      ...pairs(
        packages.map((p) => ({
          text: p.routineDiscount > 0 ? `$${p.amountUsd} · ${p.routineDiscount}% off` : `$${p.amountUsd}`,
          data: encode({ kind: 'topup', amountUsd: p.amountUsd })
        }))
      ),
      [{ text: '‹ Back', data: encode({ kind: 'home' }) }]
    ]
  };
}

/** A plain back-to-menu footer, for screens that are just text. */
export function backHome(): Keyboard {
  return [[{ text: '‹ Menu', data: encode({ kind: 'home' }) }]];
}

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

// ---------------------------------------------------------------------------

/** The command list Telegram shows behind the Menu button. */
export const CLIENT_COMMANDS: { command: string; description: string }[] = [
  { command: 'menu', description: 'Show the menu' },
  { command: 'services', description: 'Everything we make, with prices' },
  { command: 'orders', description: 'Your orders and where they are' },
  { command: 'packages', description: 'Wallet packages and their discounts' },
  { command: 'wallet', description: 'Your balance' },
  { command: 'topup', description: 'Add funds (USDT on BNB Smart Chain)' },
  { command: 'account', description: 'Your account and password status' },
  { command: 'login', description: 'A fresh sign-in code for the website' },
  { command: 'help', description: 'What I can do' },
  { command: 'cancel', description: 'Stop the current step' }
];
