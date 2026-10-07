// Sends what ownerAlertText.ts writes.
//
// Split in two because _shared/telegram.ts reads Deno.env the moment it
// loads, and the wording of these messages is worth testing under Node.
// This file is the half that cannot be tested; it is therefore the half
// with no logic in it.
import { notifyOwner } from './telegram.ts';
import {
  deliveredMessage,
  failedMessage,
  newAccountMessage,
  newOrderMessage,
  type NewOrderAlert
} from './ownerAlertText.ts';

export type { NewOrderAlert };

/** A new order, with everything needed to build it by hand. */
export async function alertNewOrder(order: NewOrderAlert): Promise<void> {
  await notifyOwner(newOrderMessage(order));
}

export async function alertNewAccount(opts: { email: string; via: 'website' | 'telegram' }): Promise<void> {
  await notifyOwner(newAccountMessage(opts));
}

export async function alertDelivered(opts: {
  publicId: string;
  productName: string;
  toEmail: boolean;
  toTelegram: boolean;
}): Promise<void> {
  await notifyOwner(deliveredMessage(opts));
}

export async function alertFailed(opts: { publicId: string; productName: string; reason: string }): Promise<void> {
  await notifyOwner(failedMessage(opts));
}
