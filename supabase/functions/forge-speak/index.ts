// Thin auth-gated wrapper around the existing Grok TTS (_shared/voice.ts).
// Always passes language 'auto' -- Forge supports any language a client
// writes in, not a fixed pair, so there's no fixed code to pick per call.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { synthesizeSpeech } from '../_shared/voice.ts';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  if (!(await resolveCaller(authHeader))) return jsonResponse({ error: 'Not authenticated' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return jsonResponse({ error: 'Missing text' }, 400);

  try {
    const audio = await synthesizeSpeech(text.slice(0, 800), 'auto');
    return new Response(audio, { headers: { ...CORS_HEADERS, 'Content-Type': 'audio/mpeg' } });
  } catch (err) {
    console.error('forge-speak failed:', err);
    return jsonResponse({ error: 'Could not synthesize speech.' }, 500);
  }
}

Deno.serve(handleRequest);
