// Cron-invoked: sweeps pending voice clones (provider_id currently holds
// the HeyGen voice_clone_id to poll) and, once HeyGen finishes training,
// overwrites provider_id with the real usable voice_id and flips status
// to ready.

import { supabaseAdmin } from '../_shared/storage.ts';
import { checkVoiceCloneStatus } from '../_shared/heygen.ts';
import { jsonResponse } from '../_shared/cors.ts';

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  const { data: pending, error } = await supabaseAdmin
    .from('client_avatars')
    .select('id, provider_id')
    .eq('kind', 'voice')
    .eq('status', 'pending')
    .not('provider_id', 'is', null);

  if (error) {
    console.error('voice-clone-poll: query failed', error);
    return jsonResponse({ ok: false, error: 'Query failed' }, 500);
  }
  if (!pending || pending.length === 0) {
    return jsonResponse({ ok: true, checked: 0 });
  }

  let ready = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const result = await checkVoiceCloneStatus(row.provider_id as string);

      if (result.status === 'ready' && result.voiceId) {
        await supabaseAdmin
          .from('client_avatars')
          .update({ status: 'ready', provider_id: result.voiceId, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        ready++;
      } else if (result.status === 'failed') {
        await supabaseAdmin
          .from('client_avatars')
          .update({ status: 'failed', failure_reason: result.error || 'HeyGen reported the clone as failed', updated_at: new Date().toISOString() })
          .eq('id', row.id);
        failed++;
      }
      // still training -- leave as-is, checked again next sweep.
    } catch (err) {
      console.error(`voice-clone-poll: check failed for ${row.id}`, err);
    }
  }

  return jsonResponse({ ok: true, checked: pending.length, ready, failed });
}

Deno.serve(handleRequest);
