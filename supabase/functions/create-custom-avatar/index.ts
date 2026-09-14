// Lets a client turn their own photo into a HeyGen "talking photo" --
// instant, no training wait, unlike a full trained avatar group. Free to
// create, gated to clients who already have wallet funds (a lightweight
// anti-abuse check, not a charge). Once created it's immediately usable
// (status 'ready') and shows up as a pickable option on the Video page.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseAdmin, uploadClientMedia } from '../_shared/storage.ts';
import { uploadTalkingPhoto } from '../_shared/heygen.ts';
import { jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_BYTES = 10 * 1024 * 1024;

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
    return jsonResponse({ error: 'Add funds to your wallet before creating a custom avatar.' }, 402);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = form.get('photo');
  const name = String(form.get('name') ?? 'My avatar').slice(0, 100);

  if (!(file instanceof File)) return jsonResponse({ error: 'Missing photo file' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return jsonResponse({ error: 'Photo must be a JPEG or PNG' }, 400);
  if (file.size > MAX_BYTES) return jsonResponse({ error: 'Photo must be under 10MB' }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());

  const { data: row, error: insertError } = await supabaseAdmin
    .from('client_avatars')
    .insert({ user_id: caller.id, kind: 'avatar', name, status: 'pending' })
    .select('id')
    .single();
  if (insertError || !row) {
    console.error('create-custom-avatar: insert failed', insertError);
    return jsonResponse({ error: 'Could not start avatar creation.' }, 500);
  }

  try {
    const [{ url: previewUrl }, talkingPhotoId] = await Promise.all([
      uploadClientMedia(`avatars/${row.id}`, 'photo', bytes, file.type),
      uploadTalkingPhoto(bytes, file.type)
    ]);

    await supabaseAdmin
      .from('client_avatars')
      .update({ status: 'ready', provider_id: talkingPhotoId, preview_url: previewUrl, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    return jsonResponse({ ok: true, id: row.id, providerId: talkingPhotoId, previewUrl });
  } catch (err) {
    console.error('create-custom-avatar: HeyGen upload failed', err);
    await supabaseAdmin
      .from('client_avatars')
      .update({ status: 'failed', failure_reason: err instanceof Error ? err.message : String(err), updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return jsonResponse({ error: 'Could not create the avatar. Please try a different photo.' }, 500);
  }
}

Deno.serve(handleRequest);
