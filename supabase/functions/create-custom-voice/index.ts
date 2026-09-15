// Lets a client clone their own voice via HeyGen. Unlike the photo-avatar
// path this is async -- HeyGen trains the clone -- so this only kicks off
// the job (status 'pending', provider_id holding the HeyGen voice_clone_id
// to poll) and voice-clone-poll (cron) fills in the real voice_id once
// ready. Free to create, gated to clients who already have wallet funds.
// HeyGen requires proof the uploader has rights to the voice being cloned
// -- since the API itself doesn't enforce a consent step, this endpoint
// requires an explicit consent flag from our own UI before ever calling
// HeyGen, and records it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseAdmin, uploadClientMedia } from '../_shared/storage.ts';
import { cloneVoice } from '../_shared/heygen.ts';
import { jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ALLOWED_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4']);
const MAX_BYTES = 15 * 1024 * 1024;

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

async function hasWalletFunds(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('wallets').select('balance_usd').eq('user_id', userId).maybeSingle();
  return Boolean(data && Number(data.balance_usd) > 0);
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const caller = await resolveCaller(authHeader);
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

  if (!(await hasWalletFunds(caller.id))) {
    return jsonResponse({ error: 'Add funds to your wallet before cloning a voice.' }, 402);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = form.get('audio');
  const name = String(form.get('name') ?? 'My voice').slice(0, 100);
  const consent = form.get('consent');

  if (consent !== 'true') {
    return jsonResponse({ error: 'You must confirm you have the right to clone this voice.' }, 400);
  }
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing audio file' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return jsonResponse({ error: 'Audio must be MP3, WAV, WEBM, or M4A' }, 400);
  if (file.size > MAX_BYTES) return jsonResponse({ error: 'Audio must be under 15MB' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  const { data: row, error: insertError } = await supabaseAdmin
    .from('client_avatars')
    .insert({ user_id: caller.id, kind: 'voice', name, status: 'pending', consent_given: true })
    .select('id')
    .single();
  if (insertError || !row) {
    console.error('create-custom-voice: insert failed', insertError);
    return jsonResponse({ error: 'Could not start voice cloning.' }, 500);
  }

  try {
    const [{ url: previewUrl }, voiceCloneId] = await Promise.all([
      uploadClientMedia(`voices/${row.id}`, 'sample', bytes, file.type),
      cloneVoice(bytes, file.type, name)
    ]);

    await supabaseAdmin
      .from('client_avatars')
      .update({ provider_id: voiceCloneId, preview_url: previewUrl, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    return jsonResponse({ ok: true, id: row.id, status: 'pending' });
  } catch (err) {
    console.error('create-custom-voice: HeyGen clone request failed', err);
    await supabaseAdmin
      .from('client_avatars')
      .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : String(err), updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return jsonResponse({ error: 'Could not start voice cloning. Please try a different sample.' }, 500);
  }
}

Deno.serve(handleRequest);
