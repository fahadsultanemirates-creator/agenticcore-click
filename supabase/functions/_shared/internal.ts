// Is this call actually coming from inside the framework?
//
// Supabase's verify_jwt gate only asks whether the bearer token is a valid
// JWT for this project -- and the anon key IS one, and it ships in the
// browser bundle. So every worker sitting behind the default gate could be
// invoked by anybody who opened the site and read the network tab: a free
// HeyGen render, a free Claude call, a task dragged into a state nobody
// ordered.
//
// The workers are only ever called by the dispatcher, by pg_cron through
// pg_net, or by each other, and all three carry the service role key. That
// is the real boundary, so check it rather than the platform's.
//
// Constant-time comparison because the alternative leaks the key one byte at
// a time to anyone patient enough to measure.

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function timingSafeEqual(a: string, b: string): boolean {
  // Length is not a secret worth protecting here, but bailing early on it
  // would make the loop below meaningless, so fold it into the result.
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** True when the caller holds the service role key. */
export function isInternalCaller(req: Request): boolean {
  const token = bearerToken(req);
  return token !== null && timingSafeEqual(token, SERVICE_ROLE_KEY);
}

/**
 * Returns a 401 Response when the caller is not internal, or null to proceed.
 * Deliberately shaped to be used as a guard clause:
 *
 *   const denied = requireInternalCaller(req);
 *   if (denied) return denied;
 */
export function requireInternalCaller(req: Request): Response | null {
  if (isInternalCaller(req)) return null;
  console.warn('rejected a non-internal call');
  return new Response(JSON.stringify({ error: 'Not authorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}
