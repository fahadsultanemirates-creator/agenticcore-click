/**
 * Where customers reach us, in one place.
 *
 * The footer's "Support on Telegram" link pointed at t.me/AgenticCoreAgency
 * -- the sister brand's handle, on the .click site. The same wrong-brand
 * link was in the .biz footer and has been fixed there too.
 *
 * The manager bot (t.me/AgenticcoreClickManagerbot) is deliberately NOT in
 * here: it is a bot that places orders for this site specifically, not the
 * support account, and the two should not be collapsed.
 */
export const TELEGRAM_HANDLE = "agenticCoreHQ";
export const TELEGRAM_URL = `https://t.me/${TELEGRAM_HANDLE}`;

export const SUPPORT_EMAIL = "hello@agenticcore.click";

/**
 * WhatsApp, once there is a number.
 *
 * Deliberately null. The owner asked for a WhatsApp button that stays
 * hidden until they supply the number, and a placeholder number on a
 * contact page is worse than no button: somebody will dial it.
 *
 * Set this to the number in international format with no spaces or plus
 * sign -- wa.me wants "971501234567" -- and the button appears.
 */
export const WHATSAPP_NUMBER: string | null = null;

/** The wa.me link, or null while there is no number. */
export function whatsAppUrl(): string | null {
  if (!WHATSAPP_NUMBER) return null;
  return `https://wa.me/${WHATSAPP_NUMBER}`;
}
