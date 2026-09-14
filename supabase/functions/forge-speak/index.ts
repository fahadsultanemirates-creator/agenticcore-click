// Thin auth-gated wrapper around the existing Grok TTS (_shared/voice.ts).
// Always passes language 'auto' -- Forge supports any language a client
// writes in, not a fixed pair, so there's no fixed code to pick per call.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { synthesizeSpeech } from '../_shared/voice.ts';

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
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  if (!(await resolveCaller(authHeader))) return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return new Response(JSON.stringify({ error: 'Missing text' }), { status: 400 });

  try {
    const audio = await synthesizeSpeech(text.slice(0, 800), 'auto');
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    console.error('forge-speak failed:', err);
    return new Response(JSON.stringify({ error: 'Could not synthesize speech.' }), { status: 500 });
  }
}

Deno.serve(handleRequest);
