// The four transactional emails, as pure functions.
//
// Pure and in their own module so they can be tested under Node without a
// Brevo key, a network call or a live account: the thing most likely to be
// wrong in an email is its text, and the thing least likely to be noticed
// is a broken one, because nobody sees the mail we send -- only the client
// does, once.
//
// Every value interpolated here comes from a brief, a product name or an
// address, so every one is escaped. An apostrophe in a business name is
// not an exploit, but it is a mangled email, and the same escape covers
// both.

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const SITE = 'https://agenticcore.click';
const DASHBOARD = `${SITE}/dashboard`;
const SUPPORT_EMAIL = 'hello@agenticcore.click';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline styles, not a stylesheet: Gmail strips <style> blocks in some
// clients and Outlook ignores most of what survives. A table-free layout
// with inline styles is the one thing that renders the same everywhere.
function shell(headline: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#09090d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 28px;font-size:18px;font-weight:700;color:#f6f5f2;">
      agenticcore<span style="color:#ffd400;">.click</span>
    </p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#f6f5f2;">${headline}</h1>
    ${bodyHtml}
    ${
      cta
        ? `<p style="margin:28px 0 0;">
      <a href="${cta.href}" style="display:inline-block;background:#ffd400;color:#09090d;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px;">${cta.label}</a>
    </p>`
        : ''
    }
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #2a2a32;font-size:13px;line-height:1.6;color:#6d6b78;">
      Questions? Reply to this email or write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#ffd400;">${SUPPORT_EMAIL}</a>.
    </p>
  </div>
</body>
</html>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#a6a4b0;">${text}</p>`;
}

/** $20 and $20.50, never $20.5 or $20.000000. */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function welcomeEmail(): Email {
  const lines = [
    'Your account is ready.',
    '',
    'Top up your wallet, pick a service, and tell us what you need — a website, ' +
      'a brochure, a logo, a short video, a social pack. You get the real files back, ' +
      'usually within the hour.',
    '',
    'Everything also works from Telegram if you would rather not open the site: ' +
      'https://t.me/AgenticcoreClickManagerbot',
    '',
    `Your dashboard: ${DASHBOARD}`,
  ];
  return {
    subject: 'Welcome to agenticcore.click',
    text: lines.join('\n'),
    html: shell(
      'Your account is ready.',
      para(
        'Top up your wallet, pick a service, and tell us what you need — a website, a ' +
          'brochure, a logo, a short video, a social pack. You get the real files back, ' +
          'usually within the hour.'
      ) +
        para(
          'Everything also works from Telegram if you would rather not open the site — ' +
            '<a href="https://t.me/AgenticcoreClickManagerbot" style="color:#ffd400;">open the bot</a>.'
        ),
      { label: 'Open your dashboard', href: DASHBOARD }
    ),
  };
}

export function orderPlacedEmail(order: { publicId: string; productName: string; priceUsd: number }): Email {
  const id = escapeHtml(order.publicId);
  const product = escapeHtml(order.productName);
  const price = formatUsd(order.priceUsd);
  return {
    subject: `Order ${order.publicId} received — ${order.productName}`,
    text: [
      `We have your order.`,
      '',
      `Reference: ${order.publicId}`,
      `Product:   ${order.productName}`,
      `Charged:   ${price} from your wallet`,
      '',
      'We will email you again the moment it is ready. You can follow it in your ' +
        `dashboard meanwhile: ${DASHBOARD}`,
    ].join('\n'),
    html: shell(
      'We have your order.',
      para(
        `<strong style="color:#f6f5f2;">${product}</strong><br>` +
          `Reference <strong style="color:#f6f5f2;">${id}</strong><br>` +
          `${price} charged from your wallet`
      ) + para('We will email you again the moment it is ready.'),
      { label: 'Follow it in your dashboard', href: DASHBOARD }
    ),
  };
}

export function orderDeliveredEmail(order: { publicId: string; productName: string }): Email {
  const id = escapeHtml(order.publicId);
  const product = escapeHtml(order.productName);
  return {
    subject: `${order.productName} is ready — ${order.publicId}`,
    text: [
      `${order.productName} is ready.`,
      '',
      `Reference: ${order.publicId}`,
      '',
      `Download it from your dashboard: ${DASHBOARD}`,
      '',
      'If it misses the brief and your product includes a revision, you can ask for ' +
        'one from the order itself.',
    ].join('\n'),
    html: shell(
      `${product} is ready.`,
      para(`Reference <strong style="color:#f6f5f2;">${id}</strong>.`) +
        para(
          'If it misses the brief and your product includes a revision, you can ask for ' +
            'one from the order itself.'
        ),
      { label: 'Download it', href: DASHBOARD }
    ),
  };
}

export function topUpEmail(topUp: { amountUsd: number; balanceUsd: number }): Email {
  const amount = formatUsd(topUp.amountUsd);
  const balance = formatUsd(topUp.balanceUsd);
  return {
    subject: `${amount} added to your wallet`,
    text: [
      `${amount} is in your wallet.`,
      '',
      `New balance: ${balance}`,
      '',
      `Spend it a service at a time: ${DASHBOARD}`,
    ].join('\n'),
    html: shell(
      `${amount} is in your wallet.`,
      para(`Your balance is now <strong style="color:#f6f5f2;">${balance}</strong>.`),
      { label: 'Start an order', href: DASHBOARD }
    ),
  };
}
