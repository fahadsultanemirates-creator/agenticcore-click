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
// grok-imagine-video caps a single clip at 15 seconds and nothing stitches
// clips together, which is exactly why no-avatar is a short-only product:
// long videos are always avatar-presented (HeyGen), billed in 30-second
// blocks. A part-avatar "hybrid" video is not offered at all -- blending an
// avatar segment with generated b-roll is real video editing, not something
// either provider does for us. Invoked by the dispatcher with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { longVideoSeconds } from '../_shared/pricing.ts';
import { getBrandProfile, brandFactsForPrompt, brandStyleForPrompt, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import { grokChat, grokVisionChat } from '../_shared/grok.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { submitHeygenVideo, type CharacterChoice } from '../_shared/heygen.ts';
import { getVideoDefaults } from '../_shared/videoDefaults.ts';
import { dimensionFor } from '../_shared/videoFormat.ts';
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

// The client's site is the brand reference for every product that carries
// their branding -- explicit field first, then any URL in the brief.
function brandUrlFor(payload: Record<string, unknown>): string | null {
  const explicit = typeof payload.websiteUrl === 'string' ? payload.websiteUrl : null;
  return normalizeUrl(explicit ?? '') ?? extractUrl(String(payload.description ?? payload.brief ?? ''));
}


// A revision only differs from the original if the generator is told what to
// change. Notes are appended to the payload by the revise path; without this
// the worker would regenerate the same brief and hand back the same thing.
function revisionInstruction(payload: Record<string, unknown>): string {
  const notes = Array.isArray(payload.revisionNotes) ? (payload.revisionNotes as string[]) : [];
  if (notes.length === 0) return '';
  const latest = notes[notes.length - 1];
  const earlier = notes.slice(0, -1);
  return (
    `\n\nThis is a REVISION of work already delivered. Change what is asked for and leave everything ` +
    `else as it was -- do not rebuild the whole thing around the change.\nWhat to change now: ${latest}` +
    (earlier.length ? `\nAlready applied previously: ${earlier.join(' | ')}` : '')
  );
}

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

  // Long is avatar-only: grok-imagine-video caps a clip at 15s and nothing
  // stitches clips together, so an avatar-free long video isn't deliverable
  // and isn't sold. Anything that still asks for one is rendered with an
  // avatar rather than silently cut to 15 seconds.
  if (payload.length === 'long' && payload.avatarStyle !== 'standard') {
    payload.avatarStyle = 'standard';
    defaulted.push('avatarStyle=standard (long is avatar-only)');
  }

  // The old standard/premium/elite tiers collapsed into one: they never
  // produced a different video, and price no longer varies by tier.
  if (payload.avatarStyle === 'premium' || payload.avatarStyle === 'elite') {
    payload.avatarStyle = 'standard';
  }

  if (payload.avatarStyle !== 'standard' && payload.avatarStyle !== 'none') {
    payload.avatarStyle = 'none';
    defaulted.push('avatarStyle=none');
  }

  if (payload.avatarStyle === 'none' && payload.noAvatarMode !== 'full') {
    // 'hybrid' included: a part-avatar video needs real editing that neither
    // provider does, so it is no longer offered and never inferred.
    payload.noAvatarMode = 'full';
    defaulted.push('noAvatarMode=full');
  }

  if (payload.length === 'short' && payload.resolution !== '720p' && payload.resolution !== '1080p') {
    payload.resolution = '720p';
    defaulted.push('resolution=720p');
  }

  if (payload.length === 'long' && longVideoSeconds(payload) === null) {
    payload.durationSeconds = 30;
    defaulted.push('durationSeconds=30');
  }

  return { payload, defaulted };
}

// submit-task already verified ownership of any custom/catalog pick
// (see validateVideoCharacterChoice) -- this just falls back to the house
// default when the client didn't choose anything specific.
// What the order asked for, else the house default the owner picked from
// Telegram, else the deployment's env fallback. The middle step is new: the
// presenter used to be an environment variable, which meant the person
// choosing it (looking at previews, on a phone) could not actually set it.
async function resolveCasting(
  payload: Record<string, unknown>
): Promise<{ character: CharacterChoice; voiceId: string; usedDefaultAvatar: boolean }> {
  const defaults = await getVideoDefaults();

  const providerId = payload.avatarProviderId;
  const characterType = payload.avatarType;
  const ordered =
    typeof providerId === 'string' && (characterType === 'avatar' || characterType === 'talking_photo')
      ? ({ type: characterType, providerId } as CharacterChoice)
      : null;

  return {
    character: ordered ?? defaults.character,
    voiceId: typeof payload.voiceProviderId === 'string' ? payload.voiceProviderId : defaults.voiceId,
    usedDefaultAvatar: ordered === null
  };
}

// ~150 spoken words per minute is the usual presenter pace, so the script
// is sized off the duration the client actually paid for (30-second blocks)
// rather than three coarse buckets that capped out at 90 seconds.
function targetWords(payload: Record<string, unknown>): number {
  if (payload.length !== 'long') return 35; // short clip, ~10-15s spoken
  const seconds = longVideoSeconds(payload) ?? 30;
  return Math.max(60, Math.round((seconds / 60) * 150));
}

async function generateScript(payload: Record<string, unknown>): Promise<string> {
  const words = targetWords(payload);
  const profile = await getBrandProfile(brandUrlFor(payload));
  const systemPrompt = `Write a natural, spoken-word video script of approximately ${words} words. Output ONLY the script text -- no stage directions, no scene headings, no markdown.`;
  const brief = String(payload.description ?? '') + brandFactsForPrompt(profile) + revisionInstruction(payload);

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
  const profile = await getBrandProfile(brandUrlFor(payload));
  const brief = String(payload.description ?? '') + brandStyleForPrompt(profile);
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

// grok-imagine-video caps a single generation at 15s, which is exactly why
// no-avatar is sold as a short-clip product only.
const NO_AVATAR_CLIP_SECONDS = 10;

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

  // Normalization above guarantees no-avatar implies a short clip at 'full'
  // -- long is avatar-only, and hybrid is not a product any more -- so this
  // branch no longer has to handle either case.
  if (payload.avatarStyle === 'none') {
    try {
      const prompt = await generateNoAvatarPrompt(payload);
      const durationSeconds = NO_AVATAR_CLIP_SECONDS;
      // Resolution is what the short clip is priced on, so render the one
      // the client actually paid for rather than always 720p.
      const resolution = payload.resolution === '1080p' ? '1080p' : '720p';
      const requestId = await submitGrokVideo(prompt, {
        durationSeconds,
        resolution,
        aspectRatio: '16:9',
        generateAudio: true
      });

      await setProviderJob(taskId, requestId);
      await logEvent(taskId, 'video_submitted', 'worker', { requestId, provider: 'grok-imagine-video', prompt, durationSeconds, resolution });

      return jsonResponse({ ok: true, requestId });
    } catch (err) {
      console.error(`worker-video (no-avatar) failed for ${taskId}:`, err);
      await markFailed(taskId, err instanceof Error ? err.message : String(err));
      return jsonResponse({ ok: false, error: 'No-avatar video generation failed' });
    }
  }

  try {
    const { character, voiceId, usedDefaultAvatar } = await resolveCasting(payload);

    if (usedDefaultAvatar) {
      // All three avatar tiers fall back to the same house presenter, so
      // pricing differentiates by resolution/duration only for this task.
      // Logged so which face actually rendered is never a mystery afterwards.
      await logEvent(taskId, 'avatar_tier_note', 'worker', {
        note: 'No avatar named on the order -- used the house default.',
        character,
        voiceId
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
