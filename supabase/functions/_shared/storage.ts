import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DELIVERABLES_BUCKET = 'deliverables';

// Uploads one deliverable under a task-scoped path and returns its public
// URL. The bucket is public-read (worker output is meant to be handed
// straight to the client), write access is service-role only.
export async function uploadDeliverable(
  taskId: string,
  filename: string,
  data: Uint8Array,
  contentType: string
): Promise<{ path: string; url: string }> {
  const path = `${taskId}/${Date.now()}-${filename}`;

  const { error } = await supabaseAdmin.storage.from(DELIVERABLES_BUCKET).upload(path, data, {
    contentType,
    upsert: false
  });
  if (error) {
    throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  }

  const { data: pub } = supabaseAdmin.storage.from(DELIVERABLES_BUCKET).getPublicUrl(path);
  return { path, url: pub.publicUrl };
}
