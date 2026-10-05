// The one place every bot reply goes out through.
//
// It used to do two things that are gone. It translated each message into
// the owner's chosen language with a Claude round-trip, and it sent a
// spoken voice note alongside the text.
//
// Both went for the same reason: this is a global product with one
// language. There is only English now, and a translation step that can
// only ever produce English is a model call, a failure mode and a second
// of latency bought for nothing. The voice note went because
// nobody asked to be read to -- the bot still LISTENS to voice notes,
// which is the half that was actually useful.
//
// What is left is a function that sends a message. It stays as the
// chokepoint anyway: telegram-webhook, daily-summary and every worker's
// notifyOwner call come through here, so when there is a next rule about
// how replies look, there is one place to put it.

import { sendTelegramText } from './telegramApi.ts';

export async function sendBotMessage(chatId: number, message: string): Promise<void> {
  await sendTelegramText(chatId, message);
}
