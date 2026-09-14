// Avatar video (short or long) is generated via HeyGen: Grok writes the
// spoken script, HeyGen renders it against a fixed house avatar/voice.
// HeyGen rendering takes minutes, so this only *submits* the job and
// leaves the task in_progress with provider_job_id set -- video-poll
// (cron) picks up completion and delivers the file.
//
// No-avatar video (pure b-roll/motion/promo) has no automated provider
// wired up yet -- rather than fake a deliverable, the task is marked
// needs_info and the owner is pinged to produce it manually. Invoked by
// the dispatcher with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { grokChat } from '../_shared/grok.ts';
import { submitHeygenVideo, DEFAULT_AVATAR, DEFAULT_VOICE_ID, type VideoDimension, type CharacterChoice } from '../_shared/heygen.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { logEvent, markNeedsInfo, markFailed, setProviderJob } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

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
  return await grokChat(
    [
      {
        role: 'system',
        content: `Write a natural, spoken-word video script of approximately ${words} words. Output ONLY the script text -- no stage directions, no scene headings, no markdown.`
      },
      { role: 'user', content: String(payload.description ?? '') }
    ],
    { maxTokens: 1000, temperature: 0.7 }
  );
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

  const payload = task.payload ?? {};

  if (payload.avatarStyle === 'none') {
    await markNeedsInfo(taskId, 'No-avatar video generation is not automated yet -- needs manual production.');
    await notifyOwner(
      `${task.public_id} needs a no-avatar video produced manually -- this path isn't automated yet.\nBrief: ${payload.description}`
    );
    return jsonResponse({ ok: true, needsManualProduction: true });
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
