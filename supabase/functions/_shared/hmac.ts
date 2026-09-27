// Signing what we send, and checking what comes back.
//
// Grok Bot holds no database credentials by design, so the only thing
// standing between a callback and this framework is the signature on it.
// That makes this file small and load-bearing in equal measure.
//
// Two separate secrets do two separate jobs. The shared key authenticates
// US to Grok Bot (a bearer token on the way out). The HMAC signature
// authenticates the payload in both directions and, because the timestamp is
// signed along with the body, stops a captured callback being replayed an
// hour later to re-deliver or re-fail a task.
//
// Pure apart from WebCrypto, which Node and Deno both provide, so the whole
// scheme is testable.

const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * What actually gets signed: the timestamp and the exact body bytes, joined
 * by a dot. Signing the body alone would let a valid signature be replayed
 * forever; signing the timestamp alone would let the body be swapped.
 */
export function signingPayload(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}

export async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(signingPayload(timestamp, body)));
  return hex(signature);
}

export interface VerifyResult {
  ok: boolean;
  /** Why it failed, for the log. Never returned to the caller -- that would
   *  turn this into an oracle for guessing signatures. */
  reason?: 'missing' | 'stale' | 'mismatch';
}

/**
 * A signature is good only if it matches AND its timestamp is recent.
 *
 * Five minutes: long enough for clock skew between two machines, short
 * enough that a captured request is useless by the time anyone has it.
 */
export async function verify(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  body: string,
  now: number = Date.now(),
  toleranceSeconds = 300
): Promise<VerifyResult> {
  if (!timestamp || !signature) return { ok: false, reason: 'missing' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'missing' };
  if (Math.abs(now / 1000 - sentAt) > toleranceSeconds) return { ok: false, reason: 'stale' };

  const expected = await sign(secret, timestamp, body);
  // Constant time: a fast rejection tells an attacker which byte was wrong.
  if (expected.length !== signature.length) return { ok: false, reason: 'mismatch' };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export const SIGNATURE_HEADER = 'X-AgenticCore-Signature';
export const TIMESTAMP_HEADER = 'X-AgenticCore-Timestamp';
