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
 * WhatsApp's own click-to-chat documentation only describes
 * https://wa.me/<phone number>; the username form is not in their docs,
 * and wa.me is unreachable from the build environment so it could not be
 * verified there either. If the username link turns out not to open a
 * chat, set WHATSAPP_PHONE to the number in international format, digits
 * only -- it takes precedence and nothing else needs changing.
 */
export const WHATSAPP_USERNAME: string | null = "agenticcore.biz";
export const WHATSAPP_PHONE: string | null = null;

/** The link to open a WhatsApp chat, or null if neither is configured. */
export function whatsAppUrl(): string | null {
  if (WHATSAPP_PHONE) return `https://wa.me/${WHATSAPP_PHONE}`;
  if (WHATSAPP_USERNAME) return `https://wa.me/${WHATSAPP_USERNAME}`;
  return null;
}

/** How the WhatsApp account is shown to a reader. */
export function whatsAppLabel(): string | null {
  if (WHATSAPP_USERNAME) return `@${WHATSAPP_USERNAME}`;
  if (WHATSAPP_PHONE) return `+${WHATSAPP_PHONE}`;
  return null;
}

export const SUPPORT_EMAIL = "hello@agenticcore.click";
