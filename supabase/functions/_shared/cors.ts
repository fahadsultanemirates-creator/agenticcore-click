// The exact header list @supabase/supabase-js itself attaches to every
// request (see its dist/cors.mjs SUPABASE_HEADERS). Missing x-client-info
// here causes the browser to silently drop the real request after a
// preflight -- no console error, no network entry -- while curl (which
// doesn't enforce CORS) succeeds fine. Every function must use this exact
// list, not a hand-rolled subset.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}
