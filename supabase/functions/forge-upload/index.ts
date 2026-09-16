// Accepts a file the client attached -- in the Forge chat window, or on a
// service page's reference field -- and stores it in the public client-media
// bucket, scoped per user. Returns a URL that goes into forge-chat's
// attachmentUrls (so it's tracked in the conversation) or straight into a
// task's payload.referenceFiles, so the worker can actually see it.
//
// conversationId is optional because a service page has no conversation. It
// only scopes the storage path; the upload is authenticated and scoped by
// caller either way.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { uploadClientMedia } from '../_shared/storage.ts';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MAX_BYTES = 15 * 1024 * 1024;

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

  const caller = await resolveCaller(authHeader);
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonResponse({ error: 'Expected multipart form data' }, 400);

  const rawConversationId = form.get('conversationId');
  const conversationId = typeof rawConversationId === 'string' && rawConversationId ? rawConversationId : 'service';
  const file = form.get('file');
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing file' }, 400);
  if (file.size > MAX_BYTES) return jsonResponse({ error: 'File is too large (15MB max).' }, 400);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';
    const { url } = await uploadClientMedia(`forge/${caller.id}/${conversationId}`, file.name || 'upload', bytes, contentType);
    return jsonResponse({ url, mimeType: contentType });
  } catch (err) {
    console.error('forge-upload failed:', err);
    return jsonResponse({ error: 'Could not upload that file. Please try again.' }, 500);
  }
}

Deno.serve(handleRequest);
