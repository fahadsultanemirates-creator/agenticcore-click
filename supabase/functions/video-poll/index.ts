// Delivers videos whose render has finished.
//
// grok-imagine-video is async: worker-video submits and stores a
// provider_job_id, this cron picks the result up. It used to branch on
// payload.avatarStyle to choose between two providers; HeyGen is gone, so
// there is one.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { checkGrokVideoStatus } from '../_shared/grokVideo.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { sendTelegramVideo } from '../_shared/telegramApi.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { jsonResponse } from '../_shared/cors.ts';

// A finished render that nobody is told about is not a delivery.
//
// Every other worker hands its result to the chat it was ordered from --
// worker-pdf sends the document, worker-social sends the images. This sweep
// sent nothing at all: the file landed in storage, the task flipped to
// delivered, and the person who ordered it saw silence. Waiting for a video
// that has already been made is indistinguishable from a render that failed.
async function handOver(
  ownerChannelId: string | null,
  publicId: string,
  url: string
): Promise<void> {
  if (!ownerChannelId) return;
  await sendTelegramVideo(Number(ownerChannelId), url, publicId).catch(async (err) => {
    console.error(`video-poll: sendTelegramVideo failed for ${publicId}`, err);
    // Telegram can refuse a URL it cannot fetch, or a file over its size
    // limit. The link still works, so send that rather than nothing.
    await notifyOwner(`${publicId} is ready: ${url}`).catch(() => {});
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  const { data: pending, error } = await supabaseAdmin
    .from('tasks')
    .select('id, public_id, version, provider_job_id, payload, owner_channel_id')
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
    try {
      // One provider now. The branch that used to pick between this and
      // HeyGen, on payload.avatarStyle, went with HeyGen itself -- every
      // in_progress video is a grok-imagine-video render.
      const result = await checkGrokVideoStatus(task.provider_job_id as string);
      // Every sweep says where the render actually is. Without this a task
      // sitting at in_progress for ten minutes could equally be the provider
      // still working or our own status call failing, with no way to tell
      // which from outside.
      console.log(`video-poll: ${task.public_id} grok status=${result.status}`);

      if (result.status === 'done' && result.videoUrl) {
        const videoResp = await fetch(result.videoUrl);
        if (!videoResp.ok) throw new Error(`Could not download rendered video (${videoResp.status})`);
        const bytes = new Uint8Array(await videoResp.arrayBuffer());
        const { url } = await uploadDeliverable(task.id, 'video.mp4', bytes, 'video/mp4');

        await addTaskFile(task.id, { url, fileType: 'video/mp4', optionIndex: 1, version: task.version });
        await logEvent(task.id, 'video_delivered', 'worker', { url });
        await markDelivered(task.id);
        await handOver(task.owner_channel_id as string | null, task.public_id as string, url);
        delivered++;
      } else if (result.status === 'failed' || result.status === 'expired') {
        const reason = result.error || `xAI reported the video generation as ${result.status}`;
        await markFailed(task.id, reason);
        await notifyOwner(`${task.public_id} failed to render.\n\n${reason}`).catch(() => {});
        failed++;
      }
      // pending -- leave as-is, checked again next sweep.
    } catch (err) {
      console.error(`video-poll: check failed for ${task.public_id}`, err);
    }
  }

  return jsonResponse({ ok: true, checked: pending.length, delivered, failed });
}

Deno.serve(handleRequest);
