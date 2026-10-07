// The shape of a Telegram sign-in code, on the website side.
//
// Mirrors CODE_ALPHABET and CODE_LENGTH in
// supabase/functions/_shared/signinCode.ts. Duplicated rather than shared
// because the SPA and the edge functions have no common build step, and
// the cost of them drifting is this hint going quiet, not a wrong login.
//
// This never decides anything. It only lets a failed login say something
// better than "Invalid login credentials" to somebody who has pasted the
// code from their chat into the password box -- which is the first thing
// a client who signed up in Telegram will do, because the code is the
// only credential they have been given.
const ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY2346789";
const LENGTH = 8;

export function looksLikeSigninCode(value: string): boolean {
  const stripped = value.replace(/[\s-]/g, "").toUpperCase();
  if (stripped.length !== LENGTH) return false;
  return [...stripped].every((char) => ALPHABET.includes(char));
}
