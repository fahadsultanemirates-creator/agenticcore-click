// Avatar video (short or long) is generated via HeyGen: Grok writes the
// spoken script, HeyGen renders it against a fixed house avatar/voice.
// HeyGen rendering takes minutes, so this only *submits* the job and
// leaves the task in_progress with provider_job_id set -- video-poll
// (cron) picks up completion and delivers the file.
//
// No-avatar video (pure b-roll/motion/promo) is generated via xAI's
// grok-imagine-video: Grok first writes a visual scene prompt (using any
// attached reference images), then that prompt is submitted the same
// async way as HeyGen -- video-poll branches on payload.avatarStyle to
// know which provider a given in_progress video task is waiting on.
// grok-imagine-video caps a single clip at 15 seconds, which comfortably
// covers "short" (5-15s) but not "long" (30s+) -- there's no multi-clip
// stitching pipeline here, so a long no-avatar request is delivered as a
// single 15s clip and the owner is notified it may need manual extending.
// "Hybrid" (avatar for part of the video) still needs manual production:
// blending an avatar segment with generated b-roll is real video editing,
// not something either provider does for us. Invoked by the dispatcher
// with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { grokChat, grokVisionChat } from '../_shared/grok.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { submitHeygenVideo, DEFAULT_AVATAR, DEFAULT_VOICE_ID, type VideoDimension, type CharacterChoice } from '../_shared/heygen.ts';
import { submitGrokVideo } from '../_shared/grokVideo.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { logEvent, markNeedsInfo, markFailed, setProviderJob } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

// Owner-sourced tasks (Telegram /new, or a free-text brief the bot's
// classifier turned into a task) carry only payload.brief -- none of the
// structured choices the dashboard's video form collects. Left unnormalized
// every read below silently degraded instead of failing: `description`
// undefined made Grok write a script from the literal string "undefined",
// and a missing `avatarStyle` fell through to the HeyGen avatar branch,
// spending real render credits on it. So the brief becomes the description
// (same `?? payload.brief` convention as worker-image/worker-pdf), and every
// other field falls back to the cheapest fully-automated shape the form
// itself offers: a short, no-avatar clip at 720p. Anything the bot *did*
// capture in payload.details survives, since that's merged in at intake.
//
// Deliberately never defaults to noAvatarMode 'hybrid' -- that path is a
// manual-production stop (markNeedsInfo below), not something to land on by
// omission.
interface VideoDefaulting {
  payload: Record<string, unknown>;
  defaulted: string[];
}

function normalizeVideoPayload(raw: Record<string, unknown>): VideoDefaulting {
  const payload = { ...raw };
  const defaulted: string[] = [];

  const description = String(payload.description ?? payload.brief ?? '').trim();
  if (description) payload.description = description;

  if (payload.length !== 'short' && payload.length !== 'long') {
    payload.length = 'short';
    defaulted.push('length=short');
  }

  const styles = ['standard', 'premium', 'elite', 'none'];
  if (!styles.includes(String(payload.avatarStyle))) {
    payload.avatarStyle = 'none';
    defaulted.push('avatarStyle=none');
  }

  if (payload.avatarStyle === 'none' && payload.noAvatarMode !== 'full' && payload.noAvatarMode !== 'hybrid') {
    payload.noAvatarMode = 'full';
    defaulted.push('noAvatarMode=full');
  }

  if (payload.length === 'short' && payload.resolution !== '720p' && payload.resolution !== '1080p') {
    payload.resolution = '720p';
    defaulted.push('resolution=720p');
  }

  if (payload.length === 'long' && !payload.duration) {
    payload.duration = '30s';
    defaulted.push('duration=30s');
  }

  return { payload, defaulted };
}

// submit-task already verified ownership of any custom/catalog pick
// (see validateVideoCharacterChoice) -- this just falls back to the house
// default when the client didn't choose anything specific.
function resolveCharacter(payload: Record<string, unknown>): CharacterChoice {
  const providerId = payload.avatarProviderId;
  const characterType = payload.avatarType;
  if (typeof providerId === 'string' && (characterType === 'avatar' || characterType === 'talking_photo')) {
    return { type: characterType, providerId };
  }
  return DEFAULT_AVATAR;
}

function resolveVoiceId(payload: Record<string, unknown>): string {
  return typeof payload.voiceProviderId === 'string' ? payload.voiceProviderId : DEFAULT_VOICE_ID;
}

function dimensionFor(payload: Record<string, unknown>): VideoDimension {
  if (payload.length === 'long') return { width: 1920, height: 1080 };
  const resolution = payload.resolution === '720p' ? 720 : 1080;
  return { width: resolution, height: Math.round((resolution * 16) / 9) };
}

function targetWords(payload: Record<string, unknown>): number {
  if (payload.length !== 'long') return 35; // short clip, ~10-15s spoken
  const duration = String(payload.duration ?? '30s');
  if (duration.startsWith('30')) return 75;
  if (duration.startsWith('60')) return 150;
  return 220; // 90s+
}

async function generateScript(payload: Record<string, unknown>): Promise<string> {
  const words = targetWords(payload);
  const systemPrompt = `Write a natural, spoken-word video script of approximately ${words} words. Output ONLY the script text -- no stage directions, no scene headings, no markdown.`;
  const brief = String(payload.description ?? '');

  const attachments = await fetchAttachments(payload.referenceFiles);
  if (attachments.length > 0) {
    return await grokVisionChat(
      `${systemPrompt} You are also given reference image(s) (product shots/brand photos) -- let what's genuinely in them inform the script's content.`,
      brief,
      attachments,
      { maxTokens: 1000, temperature: 0.7 }
    );
  }

  return await grokChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: brief }
    ],
    { maxTokens: 1000, temperature: 0.7 }
  );
}

// grok-imagine-video takes one visual prompt, not a spoken script -- no
// dialogue or on-screen text, since there's no avatar to say it.
async function generateNoAvatarPrompt(payload: Record<string, unknown>): Promise<string> {
  const brief = String(payload.description ?? '');
  const systemPrompt =
    'Write a single, vivid visual prompt for an AI video generator producing a short business promo clip -- ' +
    'no dialogue, no avatar, no on-screen text. Describe the scene/subject, camera movement, lighting, and mood ' +
    'in 2-3 sentences. Output ONLY the prompt text.';

  const attachments = await fetchAttachments(payload.referenceFiles);
  if (attachments.length > 0) {
    return await grokVisionChat(
      `${systemPrompt} Reference image(s) are attached -- let their real subject/style/colors inform the scene.`,
      brief,
      attachments,
      { maxTokens: 400, temperature: 0.7 }
    );
  }

  return await grokChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: brief }
    ],
    { maxTokens: 400, temperature: 0.7 }
  );
}

// grok-imagine-video caps a single generation at 15s -- that's a natural
// fit for "short" (5-15s) but well under a "long" (30s+) request; there's
// no clip-stitching here, so long delivers at the model's max instead.
function noAvatarDurationSeconds(payload: Record<string, unknown>): number {
  return payload.length === 'long' ? 15 : 10;
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const taskId = body?.taskId;
  if (typeof taskId !== 'string') return jsonResponse({ error: 'Missing taskId' }, 400);

  const { data: task, error } = await supabaseAdmin.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (error || !task) return jsonResponse({ error: 'Task not found' }, 404);

  const { payload, defaulted } = normalizeVideoPayload(task.payload ?? {});

  // No brief at all means there is nothing to make a video from -- stop
  // before spending a HeyGen render or a Grok video generation on it.
  if (!payload.description) {
    await markNeedsInfo(taskId, 'No description/brief on this video task -- nothing to generate from.');
    await notifyOwner(`${task.public_id} has no brief text, so there's nothing to build a video from. Send the brief and re-queue it.`);
    return jsonResponse({ ok: true, needsInfo: true });
  }

  if (defaulted.length > 0) {
    await logEvent(taskId, 'video_options_defaulted', 'worker', {
      defaulted,
      note: 'Task arrived without these structured choices (owner/free-text intake) -- filled with the cheapest fully-automated defaults.'
    });
  }

  if (payload.avatarStyle === 'none') {
    if (payload.noAvatarMode === 'hybrid') {
      await markNeedsInfo(taskId, 'Hybrid avatar/no-avatar videos need manual editing to blend the two styles -- not automated yet.');
      await notifyOwner(
        `${task.public_id} needs a hybrid avatar/no-avatar video produced manually -- this path isn't automated yet.\nBrief: ${payload.description}`
      );
      return jsonResponse({ ok: true, needsManualProduction: true });
    }

    try {
      const prompt = await generateNoAvatarPrompt(payload);
      const durationSeconds = noAvatarDurationSeconds(payload);
      const requestId = await submitGrokVideo(prompt, {
        durationSeconds,
        resolution: payload.length === 'long' ? '1080p' : '720p',
        aspectRatio: '16:9',
        generateAudio: true
      });

      await setProviderJob(taskId, requestId);
      await logEvent(taskId, 'video_submitted', 'worker', { requestId, provider: 'grok-imagine-video', prompt, durationSeconds });

      if (payload.length === 'long') {
        await notifyOwner(
          `${task.public_id} (long, no-avatar) was auto-generated at 15s -- grok-imagine-video's max per clip. ` +
            `Let the client know if they need it extended to the full requested length; multi-clip stitching isn't wired up yet.`
        );
      }

      return jsonResponse({ ok: true, requestId });
    } catch (err) {
      console.error(`worker-video (no-avatar) failed for ${taskId}:`, err);
      await markFailed(taskId, err instanceof Error ? err.message : String(err));
      return jsonResponse({ ok: false, error: 'No-avatar video generation failed' });
    }
  }

  try {
    const character = resolveCharacter(payload);
    const voiceId = resolveVoiceId(payload);

    if (character === DEFAULT_AVATAR && ['standard', 'premium', 'elite'].includes(payload.avatarStyle as string)) {
      // Client didn't pick a specific avatar -- all three tiers fall back to
      // the same house avatar/voice, so pricing differentiates by
      // resolution/duration only for this task. Logged so it's visible.
      await logEvent(taskId, 'avatar_tier_note', 'worker', {
        note: 'No avatar/voice selected -- fell back to the shared house default.'
      });
    }

    const script = await generateScript(payload);
    const dimension = dimensionFor(payload);
    const videoId = await submitHeygenVideo(script, dimension, character, voiceId);

    await setProviderJob(taskId, videoId);
    await logEvent(taskId, 'video_submitted', 'worker', { videoId, dimension, character, voiceId, script });

    return jsonResponse({ ok: true, videoId });
  } catch (err) {
    console.error(`worker-video failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Video generation failed' });
  }
}

Deno.serve(handleRequest);
