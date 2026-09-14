// Thin auth-gated wrapper around the existing Grok STT (_shared/voice.ts),
// reused as-is from the Telegram bot's voice pipeline. The frontend records
// a voice note, sends it here, and drops the returned text straight into
// the composer -- same code path as typed text from there on.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { transcribeAudio } from '../_shared/voice.ts';
import { jsonResponse } from '../_shared/cors.ts';

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
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  if (!(await resolveCaller(authHeader))) return jsonResponse({ error: 'Not authenticated' }, 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing audio file' }, 400);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text } = await transcribeAudio(bytes, file.name || 'voice.webm');
    return jsonResponse({ text });
  } catch (err) {
    console.error('forge-transcribe failed:', err);
    return jsonResponse({ error: 'Could not understand that voice message.' }, 500);
  }
}

Deno.serve(handleRequest);
