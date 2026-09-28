// Sealing an outbound notice so it survives the trip to Grok Bot.
//
// The first live order reached Grok Bot with no signature at all. We were
// sending X-AgenticCore-Timestamp and X-AgenticCore-Signature, and the
// request came back 200, so nothing looked wrong from this end -- but Grok
// Bot's gateway forwards only content-type and user-agent to their code.
// Authorization is consumed by the gateway itself and never reaches them,
// and every X- header is dropped. It is not an allowlist anybody can widen.
//
// So the signature has to travel in the body, which is the one thing that
// arrives intact. Two consequences follow, both deliberate:
//
//   1. The signing secret is GROKBOT_CALLBACK_SECRET, not the outbound
//      webhook key. We separated the two secrets on purpose -- one per
//      direction -- and this collapses them back onto one. It is forced,
//      not a regression: the outbound key is eaten by the gateway, so Grok
//      Bot's code can never hold it to check anything. The callback secret
//      is the only secret both sides have that also survives the trip.
//
//   2. The signed string is CANONICAL json, not the bytes we happened to
//      send. Carrying the exact signed string verbatim would be safer in
//      principle, but the receiver has already specified canonical form, and
//      a signature only works when both sides agree. canonicalJson is what
//      makes that agreement mechanical rather than a matter of luck.

import { canonicalJson } from './canonicalJson.ts';
import { sign } from './hmac.ts';

export interface SealedNotice {
  /** The notice itself. Whatever shape the caller passes, unaltered. */
  payload: unknown;
  /** Unix seconds. Signed alongside the body, so a captured notice goes
   *  stale instead of being replayable forever. */
  ts: number;
  /** HMAC-SHA256 over `ts + "." + canonicalJson(payload)`, hex. */
  sig: string;
}

export async function sealNotice(
  secret: string,
  payload: unknown,
  nowMs: number = Date.now()
): Promise<SealedNotice> {
  const ts = Math.floor(nowMs / 1000);
  const sig = await sign(secret, String(ts), canonicalJson(payload));
  return { payload, ts, sig };
}
