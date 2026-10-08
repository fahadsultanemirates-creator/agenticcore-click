// Records one page view.
//
// Public by necessity (verify_jwt = false in ../../config.toml): most
// visitors have no account, and the ones worth counting most are the
// people deciding whether to open one.
//
// The client sends only the page and its referrer. Who the visitor is,
// is derived HERE from the request's own headers -- the forwarded IP and
// the user agent -- because a browser that could name its own visitor
// hash could name a thousand of them, and the only number the owner acts
// on would be fiction.
import { CORS_HEADERS } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/storage.ts';
import { isBotUserAgent, normalisePath, referrerHost } from '../_shared/visitors.ts';

const SELF_HOST = 'agenticcore.click';

/**
 * The salt that makes the hash un-reversible and un-linkable across days.
 *
 * A dedicated secret if one is set; the service role key otherwise, which
 * is always present and never leaves the server. Either way the stored
 * value is a digest, and tomorrow's digest of the same person differs.
 */
const SALT = Deno.env.get('VISITOR_SALT') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'unsalted';

async function visitorHash(ip: string, userAgent: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${SALT}|${day}|${ip}|${userAgent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  // Always 204, whatever happened. This is a beacon fired during a page
  // view: there is no one to show an error to, and a failing analytics
  // call must never be something a visitor can notice.
  const ok = () => new Response(null, { status: 204, headers: CORS_HEADERS });

  if (req.method !== 'POST') return ok();

  let body: { path?: unknown; referrer?: unknown };
  try {
    body = await req.json();
  } catch {
    return ok();
  }

  const userAgent = req.headers.get('user-agent') ?? '';
  // x-forwarded-for is a list; the client's own address is the first.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

  try {
    const { error } = await supabaseAdmin.from('page_views').insert({
      path: normalisePath(typeof body.path === 'string' ? body.path : null),
      referrer_host: referrerHost(typeof body.referrer === 'string' ? body.referrer : null, SELF_HOST),
      visitor_hash: await visitorHash(ip, userAgent),
      is_bot: isBotUserAgent(userAgent)
    });
    if (error) console.error('track-visit: insert failed', error);
  } catch (err) {
    console.error('track-visit: failed', err);
  }

  return ok();
}

Deno.serve(handleRequest);
