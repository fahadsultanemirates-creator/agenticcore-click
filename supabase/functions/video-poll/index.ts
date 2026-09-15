// Cron-invoked (see supabase/migrations for the pg_cron schedule): sweeps
// in_progress video tasks with a provider job outstanding, and on
// completion downloads the rendered file into our own storage (both
// providers' own URLs are time-limited) and delivers it. Avatar videos
// (worker-video's HeyGen path) and no-avatar videos (its grok-imagine-video
// path) are both async submit-then-poll, so this sweep handles either --
// payload.avatarStyle says which provider a given row's provider_job_id
// belongs to.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { checkHeygenStatus } from '../_shared/heygen.ts';
import { checkGrokVideoStatus } from '../_shared/grokVideo.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  const { data: pending, error } = await supabaseAdmin
    .from('tasks')
    .select('id, public_id, version, provider_job_id, payload')
    .eq('type', 'video')
    .eq('status', 'in_progress')
    .not('provider_job_id', 'is', null);

  if (error) {
    console.error('video-poll: query failed', error);
    return jsonResponse({ ok: false, error: 'Query failed' }, 500);
  }
  if (!pending || pending.length === 0) {
    return jsonResponse({ ok: true, checked: 0 });
  }

  let delivered = 0;
  let failed = 0;

  for (const task of pending) {
    const isNoAvatar = (task.payload as Record<string, unknown> | null)?.avatarStyle === 'none';

    try {
      if (isNoAvatar) {
        const result = await checkGrokVideoStatus(task.provider_job_id as string);

        if (result.status === 'done' && result.videoUrl) {
          const videoResp = await fetch(result.videoUrl);
          if (!videoResp.ok) throw new Error(`Could not download rendered video (${videoResp.status})`);
          const bytes = new Uint8Array(await videoResp.arrayBuffer());
          const { url } = await uploadDeliverable(task.id, 'video.mp4', bytes, 'video/mp4');

          await addTaskFile(task.id, { url, fileType: 'video/mp4', optionIndex: 1, version: task.version });
          await logEvent(task.id, 'video_delivered', 'worker', { url });
          await markDelivered(task.id);
          delivered++;
        } else if (result.status === 'failed' || result.status === 'expired') {
          await markFailed(task.id, result.error || `xAI reported the video generation as ${result.status}`);
          failed++;
        }
        // pending -- leave as-is, checked again next sweep.
      } else {
        const result = await checkHeygenStatus(task.provider_job_id as string);

        if (result.status === 'completed' && result.videoUrl) {
          const videoResp = await fetch(result.videoUrl);
          if (!videoResp.ok) throw new Error(`Could not download rendered video (${videoResp.status})`);
          const bytes = new Uint8Array(await videoResp.arrayBuffer());
          const { url } = await uploadDeliverable(task.id, 'video.mp4', bytes, 'video/mp4');

          await addTaskFile(task.id, { url, fileType: 'video/mp4', optionIndex: 1, version: task.version });
          await logEvent(task.id, 'video_delivered', 'worker', { url });
          await markDelivered(task.id);
          delivered++;
        } else if (result.status === 'failed') {
          await markFailed(task.id, result.error || 'HeyGen reported the render as failed');
          failed++;
        }
        // processing/pending -- leave as-is, checked again next sweep.
      }
    } catch (err) {
      console.error(`video-poll: check failed for ${task.public_id}`, err);
    }
  }

  return jsonResponse({ ok: true, checked: pending.length, delivered, failed });
}

Deno.serve(handleRequest);
