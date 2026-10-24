/**
 * Support contacts, in one place.
 *
 * These are SUPPORT channels only. They are deliberately NOT the ordering
 * bot: .click's hero links to t.me/AgenticcoreClickManagerbot, which
 * creates projects and places orders. That is a different job with a
 * different destination, and routing it through here would send someone
 * with a billing question into an order flow.
 *
 * All three sites use the same two accounts, so a customer who finds one
 * brand and asks about another reaches the same people.
 */

/** Telegram support account. Changed from agenticCoreHQ, per the owner. */
export const TELEGRAM_HANDLE = "AgenticCorebiz";
export const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`;

/**
 * WhatsApp support account.
 *
 * The number is what the link uses. WhatsApp's own click-to-chat
 * documentation describes exactly one form, https://wa.me/<number> with
 * the number in international format and no plus, spaces or leading
 * zeroes -- so that is the form a stranger's phone is guaranteed to
 * open. The username is kept because it is the same account and is what
 * a person would search for inside WhatsApp, but it is deliberately not
 * what the button points at: the username link form appears in no
 * WhatsApp documentation, and wa.me is unreachable from the build
 * environment, so it could not be verified either way.
 *
 * Clear WHATSAPP_PHONE to fall back to the username link.
 */
export const WHATSAPP_USERNAME: string | null = "agenticcore.biz";
export const WHATSAPP_PHONE: string | null = "18089985226";

/** The link to open a WhatsApp chat, or null if neither is configured. */
export function whatsAppUrl(): string | null {
  if (WHATSAPP_PHONE) return `https://wa.me/${WHATSAPP_PHONE}`;
  if (WHATSAPP_USERNAME) return `https://wa.me/${WHATSAPP_USERNAME}`;
  return null;
}

/**
 * How the WhatsApp account is shown to a reader.
 *
 * Shows whatever the link actually opens, so the two cannot disagree --
 * and a number is the more useful of the two on a contact page, because
 * it can be saved as a contact rather than only tapped.
 */
export function whatsAppLabel(): string | null {
  if (WHATSAPP_PHONE) {
    const d = WHATSAPP_PHONE;
    // Grouped for reading, never for the link. Two shapes, because the
    // number has already moved once: 1 + 10 digits reads as
    // +1 808 998 5226, and 971 + 9 as +971 58 522 7837. Anything else
    // is shown unformatted rather than chopped into the wrong groups --
    // a misgrouped number still dials, but it looks like a typo.
    if (d.length === 11 && d.startsWith("1")) {
      return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
    }
    if (d.length === 12 && d.startsWith("971")) {
      return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
    }
    return `+${d}`;
  }
  if (WHATSAPP_USERNAME) return `@${WHATSAPP_USERNAME}`;
  return null;
}

export const SUPPORT_EMAIL = "hello@agenticcore.group";

/**
 * The Telegram CHANNEL -- where announcements get posted.
 *
 * Deliberately separate from TELEGRAM_HANDLE above. That one is a person
 * you message when something is wrong; this one is a feed you read. They
 * are different accounts doing different jobs, and collapsing them would
 * send someone with a broken order into a broadcast channel that cannot
 * reply.
 */
export const TELEGRAM_CHANNEL_HANDLE = "agenticCoreHQ";
export const TELEGRAM_CHANNEL_URL = `https://t.me/${TELEGRAM_CHANNEL_HANDLE}`;

/**
 * The public accounts, identical on all three sites.
 *
 * One list, so .agency, .biz and .click cannot drift apart again -- they
 * had two different Facebook links and TikTok on only one site before
 * this. Order is the order they are shown in.
 *
 * These are PAGES, not support channels: see TELEGRAM_HANDLE,
 * whatsAppUrl() and SUPPORT_EMAIL for the ways to reach a human.
 */
export const SOCIAL_LINKS = [
  { key: "x", label: "X", href: "https://x.com/AgenticCoreHQ" },
  {
    key: "facebook",
    label: "Facebook",
    // The Page's own canonical address. The /share/ short links that
    // used to be here differed per site and are opaque -- you cannot
    // tell from one whether it points at the right Page.
    href: "https://www.facebook.com/people/AgenticCore/61593981579304/",
  },
  { key: "instagram", label: "Instagram", href: "https://www.instagram.com/agenticcore.agency" },
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/@AgenticcoreAgency" },
  { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@agenticcore.agency" },
  { key: "telegram-channel", label: "Telegram channel", href: TELEGRAM_CHANNEL_URL },
] as const;

export type SocialKey = (typeof SOCIAL_LINKS)[number]["key"];
