// The one-time code that turns a Telegram conversation into a website
// account.
//
// Pure, so the parts that are easy to get quietly wrong -- the alphabet,
// the formatting, what counts as expired, how a typed code is normalised
// before comparison -- can be tested without a database or a bot.
//
// The code is a credential: anyone holding it can set the password on an
// account. It is therefore generated from crypto.getRandomValues, stored
// only as a SHA-256 hash, and compared in constant time. The plaintext
// exists in exactly two places: the Telegram message, and the client's
// head.

/**
 * 29 characters: A-Z and 0-9, minus each half of a lookalike pair --
 * I/1, O/0, S/5, Z/2. Both sides go, not just one, since the point is
 * that no two characters in the set can be confused for each other.
 *
 * These are the ones people mistype reading a code off a phone screen
 * onto a laptop. Being unmisreadable is worth more than the symbols it
 * costs: at 8 characters this still gives 29^8, around 500 billion,
 * which is far past guessing against a rate-limited endpoint.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';

export const CODE_LENGTH = 8;

/** 30 days, as the client was told. */
export const CODE_TTL_DAYS = 30;

/** Reminders before the grace period runs out. */
export const REMINDER_DAYS = [23, 29] as const;

/**
 * A fresh code, already grouped: "AB3F-KM79".
 *
 * Rejection sampling rather than `% alphabet.length`: the modulo is
 * biased toward the first few letters when 256 is not a multiple of the
 * alphabet size, and it is not, which would make some codes measurably
 * likelier than others.
 */
export function generateCode(randomBytes: (n: number) => Uint8Array = cryptoBytes): string {
  const out: string[] = [];
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  while (out.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= limit) continue;
      out.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
      if (out.length === CODE_LENGTH) break;
    }
  }
  return formatCode(out.join(''));
}

function cryptoBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** "AB3FKM79" -> "AB3F-KM79". Display only; never what gets hashed. */
export function formatCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === CODE_LENGTH ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/**
 * What a typed code means, before it is compared to anything.
 *
 * People paste codes with the hyphen, without it, in lower case, with a
 * trailing space from the copy, and occasionally with the surrounding
 * quotes. All of those are the same code. Returns null when what is left
 * could not be one -- wrong length, or a character this alphabet never
 * produces, which is the "you typed O instead of 0" case stated plainly
 * rather than as "invalid code".
 */
export function normaliseCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== CODE_LENGTH) return null;
  for (const char of clean) {
    if (!CODE_ALPHABET.includes(char)) return null;
  }
  return clean;
}

/** SHA-256 hex. The database never holds a usable code. */
export async function hashCode(normalised: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function expiryFrom(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type CodeState = 'valid' | 'used' | 'expired';

/**
 * Whether a stored code can still be redeemed.
 *
 * Used is checked before expired on purpose: a client who already set
 * their password and tries the old code should be told it has been used,
 * not that it ran out -- the second sends them to support over an account
 * that is working.
 */
export function codeState(
  row: { usedAt: Date | string | null; expiresAt: Date | string },
  now: Date = new Date()
): CodeState {
  if (row.usedAt) return 'used';
  return new Date(row.expiresAt).getTime() <= now.getTime() ? 'expired' : 'valid';
}

/** Whole days left, floored, never negative. For the reminder wording. */
export function daysLeft(expiresAt: Date | string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Constant-time string comparison, for comparing two hashes.
 *
 * Hashes are not secret the way the code is, but the early-exit on a
 * normal === leaks how many leading characters matched, and that is
 * enough to walk a hash out one nibble at a time given enough attempts.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
