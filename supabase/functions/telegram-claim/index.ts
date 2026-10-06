// Turns a Telegram sign-in code into a password.
//
// The client types their email and the code the bot gave them, chooses a
// password, and from then on signs in like anyone else. This is the only
// way an account created in Telegram ever gets a password, so it is also
// the only thing standing between a leaked code and somebody else's
// account.
//
// Public by necessity -- the caller has no session yet, that being the
// entire point. The code is the credential, so:
//
//  * it is compared as a SHA-256 hash, and redeemed by an RPC that marks
//    it used in the same statement it reads it, so two browsers racing
//    the same code cannot both succeed;
//  * the email must match the account the code belongs to. The code alone
//    would be enough to be sure, but requiring both means a code read
//    over someone's shoulder is not sufficient on its own;
//  * every failure says the same thing. "No account with that email" and
//    "wrong code" told apart is an oracle for which addresses have
//    accounts.
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { hashCode, normaliseCode } from '../_shared/signinCode.ts';
import { supabaseAdmin } from '../_shared/storage.ts';

const MIN_PASSWORD_LENGTH = 8;

// Said to the client whatever actually went wrong.
const REFUSED =
  'That email and code do not match an account, or the code has already been used or expired. ' +
  'Send /login to the bot for a new code, or write to hello@agenticcore.click.';

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: { email?: unknown; code?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Bad request' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const rawCode = typeof body.code === 'string' ? body.code : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !rawCode) return jsonResponse({ error: REFUSED }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return jsonResponse({ error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const normalised = normaliseCode(rawCode);
  // A code that cannot even be one of ours is still worth the same answer
  // as a wrong one -- telling the difference leaks the code format.
  if (!normalised) return jsonResponse({ error: REFUSED }, 400);

  const codeHash = await hashCode(normalised);

  // Whose code this is, before spending it. Checking the address first
  // means a client who mistypes their own email does not also lose the
  // code and have to go back to the bot for another one. The read is not
  // the authorisation -- redeem_signin_code below re-checks used/expired
  // atomically, so two browsers racing the same code still cannot both
  // win; this only decides whether it is worth spending at all.
  const { data: codeRow, error: codeError } = await supabaseAdmin
    .from('tg_signin_codes')
    .select('user_id, used_at, expires_at')
    .eq('code_hash', codeHash)
    .maybeSingle<{ user_id: string; used_at: string | null; expires_at: string }>();

  if (codeError) {
    console.error('telegram-claim: code lookup failed', codeError);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
  }
  if (!codeRow) return jsonResponse({ error: REFUSED }, 400);

  const { data: account, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(codeRow.user_id);
  if (lookupError || !account?.user) {
    console.error('telegram-claim: code belongs to a user that does not exist', lookupError);
    return jsonResponse({ error: REFUSED }, 400);
  }
  if ((account.user.email ?? '').toLowerCase() !== email) {
    console.warn(`telegram-claim: a code for ${codeRow.user_id} was presented with a different address`);
    return jsonResponse({ error: REFUSED }, 400);
  }

  const { data: userId, error } = await supabaseAdmin.rpc('redeem_signin_code', { p_code_hash: codeHash });
  if (error) {
    console.error('telegram-claim: redeem failed', error);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500);
  }
  // Null here means used or expired -- both of which the row above may
  // have looked fine for a moment ago, since the check is not the lock.
  if (!userId) return jsonResponse({ error: REFUSED }, 400);

  // Past this point the code is spent whichever way the password goes.
  // The only realistic failure left is Supabase rejecting the password
  // itself, which the length check above already covers; anything else
  // is rare enough to be worth a support email rather than a code that
  // survives failed attempts and can be retried against other addresses.
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(String(userId), { password });
  if (updateError) {
    console.error('telegram-claim: setting the password failed', updateError);
    return jsonResponse(
      { error: 'Could not set that password, and the code is now used. Send /login to the bot for a new one.' },
      400
    );
  }

  return jsonResponse({ ok: true, email });
}

Deno.serve(handleRequest);
