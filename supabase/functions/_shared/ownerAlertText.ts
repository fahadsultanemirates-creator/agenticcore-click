// What the owner is told, word for word.
//
// While manual mode is on, these messages are the product: every order
// arrives here and is built by hand from what the alert says. An alert
// missing the brief is a trip to the dashboard; an alert missing the
// reference is a job that cannot be delivered back.
//
// So each one carries everything needed to do the work and nothing that
// needs looking up, and ends with the exact command that closes it.
//
// Pure, and separate from ownerAlerts.ts which sends them: _shared/telegram.ts
// reads Deno.env at module load, and these tests run under Node.

/** Money, the way it is shown everywhere else. */
function usd(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

/**
 * A payload rendered as readable lines.
 *
 * A brief is whatever the intake collected -- a form's twenty fields, or
 * one sentence a client typed into a chat. Both have to be legible in a
 * phone notification, so: skip the empties, skip the plumbing, put the
 * long free-text fields last where they can run on without pushing the
 * short facts off the screen.
 */
export function formatBrief(payload: Record<string, unknown>): string {
  const SKIP = new Set(['sku', 'tier', 'subtype', 'referenceFiles']);
  const LONG = new Set(['description', 'brief', 'notes', 'services', 'contactDetails']);

  const short: string[] = [];
  const long: string[] = [];

  for (const [key, raw] of Object.entries(payload ?? {})) {
    if (SKIP.has(key)) continue;
    if (raw === null || raw === undefined || raw === '') continue;

    const value = Array.isArray(raw) ? raw.join(', ') : String(raw);
    if (value.trim() === '' || value === 'undefined') continue;

    const label = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());

    (LONG.has(key) ? long : short).push(`${label}: ${value}`);
  }

  const lines = [...short, ...long];
  return lines.length > 0 ? lines.join('\n') : '(no details given)';
}

export interface NewOrderAlert {
  publicId: string;
  productName: string;
  priceUsd: number;
  source: string;
  payload: Record<string, unknown>;
  clientEmail?: string | null;
  attachments?: string[];
}

/** A new order, with everything needed to build it. */
export function newOrderMessage(order: NewOrderAlert): string {
  const where =
    order.source === 'telegram' ? 'Telegram' : order.source === 'website' ? 'the website' : order.source;

  const lines = [
    `NEW ORDER — ${order.publicId}`,
    '',
    `${order.productName} · ${usd(order.priceUsd)} · from ${where}`,
    order.clientEmail ? `Client: ${order.clientEmail}` : '',
    '',
    formatBrief(order.payload),
    ...(order.attachments && order.attachments.length > 0
      ? ['', 'Files they sent:', ...order.attachments]
      : []),
    '',
    `When it is ready: attach the file here with /deliver ${order.publicId} as the caption,`,
    `or send /deliver ${order.publicId} <link>.`
  ];

  return lines.filter((line) => line !== '').join('\n');
}

/** Somebody signed up. */
export function newAccountMessage(opts: { email: string; via: 'website' | 'telegram' }): string {
  return [`NEW ACCOUNT — ${opts.email}`, '', `Signed up via ${opts.via === 'telegram' ? 'Telegram' : 'the website'}.`].join('\n');
}

/** A deliverable went out -- confirmation that it actually reached the client. */
export function deliveredMessage(opts: {
  publicId: string;
  productName: string;
  toEmail: boolean;
  toTelegram: boolean;
}): string {
  const channels = [opts.toEmail ? 'email' : '', opts.toTelegram ? 'Telegram' : ''].filter(Boolean);
  return [
    `DELIVERED — ${opts.publicId}`,
    '',
    opts.productName,
    channels.length > 0 ? `Client notified by ${channels.join(' and ')}.` : 'No way to notify this client.'
  ].join('\n');
}

/** Something broke. */
export function failedMessage(opts: { publicId: string; productName: string; reason: string }): string {
  return [`FAILED — ${opts.publicId}`, '', opts.productName, '', opts.reason].join('\n');
}
