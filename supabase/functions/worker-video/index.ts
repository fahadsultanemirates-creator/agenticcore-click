// Video is one product shape now: a single clip of 15 seconds or less.
//
// HeyGen is gone. It was the only engine that made a presenter speak a
// script with lip-sync, and removing it removes that from this worker --
// deliberately. Avatar clips are fulfilled by Grok Bot, who renders them on
// his own machine; routing is what sends them there (/assign 40 grokbot),
// not code in here.
//
// What is left in here is the no-avatar path: Grok writes a visual scene
// prompt from the brief and any reference images, grok-imagine-video
// renders it. Submission is async -- this only submits and leaves the task
// in_progress with provider_job_id set, and video-poll (cron) delivers the
// file when it is ready.
//
// An avatar clip reaching this worker means the external agent did not take
// it. It is held for a human rather than rendered, because the clip this
// worker can produce has nobody speaking in it, and quietly delivering a
// silent scene against an order for a presenter is the wrong deliverable
// rather than a lesser one. Invoked by the dispatcher with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { getBrandProfile, brandStyleForPrompt, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import { grokChat, grokVisionChat } from '../_shared/grok.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { aspectFor } from '../_shared/videoFormat.ts';
import { VIDEO_RESOLUTION } from '../_shared/pricing.ts';
import { resolveSku, shapeInstruction, specOf } from '../_shared/catalog.ts';
import { missingRequired, infoRequest } from '../_shared/requirements.ts';
import { submitGrokVideo } from '../_shared/grokVideo.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { logEvent, markNeedsInfo, markFailed, setProviderJob } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { requireInternalCaller } from '../_shared/internal.ts';

// Owner-sourced tasks (Telegram /new, or a free-text brief the bot's
// classifier turned into a task) carry only payload.brief -- none of the
// structured choices the dashboard's video form collects. Left unnormalized
// every read below silently degraded instead of failing: `description`
// undefined made Grok write a script from the literal string "undefined",
// and a missing `avatarStyle` fell through to the HeyGen avatar branch,
// spending real render credits on it. So the brief becomes the description
// (same `?? payload.brief` convention as worker-image/worker-pdf), and every
// other field falls back to the shape the form itself offers: a short,
// no-avatar 1080p clip. Anything the bot *did* capture in payload.details
// survives, since that's merged in at intake.

// The client's site is the brand reference for every product that carries
// their branding -- explicit field first, then any URL in the brief.
function brandUrlFor(payload: Record<string, unknown>): string | null {
  const explicit = typeof payload.websiteUrl === 'string' ? payload.websiteUrl : null;
  return normalizeUrl(explicit ?? '') ?? extractUrl(String(payload.description ?? payload.brief ?? ''));
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

  // There is one length now. An older order still carrying length='long'
  // is not silently cut to 15 seconds: pricing returns null for it, so it
  // never reaches a worker in the first place.
  payload.length = 'short';

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
    // 'hybrid' included: a part-avatar video needs real editing that no
    // provider here does, so it is not offered and never inferred.
    payload.noAvatarMode = 'full';
    defaulted.push('noAvatarMode=full');
  }

  // Every clip is 1080p, full stop.
  //
  // This used to read a resolution out of the order, and failing that out
  // of the words of the brief, because resolution was a priced tier. It is
  // not any more -- one price, one quality -- so honouring "make it 720p"
  // from a brief now means charging the full $3 and shipping the worse
  // clip, on the strength of a phrase the client may not even have meant
  // as an instruction.
  if (payload.resolution !== VIDEO_RESOLUTION) {
    payload.resolution = VIDEO_RESOLUTION;
  }

  return { payload, defaulted };
}

// grok-imagine-video takes one visual prompt, not a spoken script -- no
// dialogue or on-screen text, since there's no avatar to say it.
async function generateNoAvatarPrompt(payload: Record<string, unknown>): Promise<string> {
  const profile = await getBrandProfile(brandUrlFor(payload));
  const brief = String(payload.description ?? '') + brandStyleForPrompt(profile);
  const product = resolveSku('video', payload);
  const systemPrompt =
    `${product ? shapeInstruction(product) + ' ' : ''}` +
    'Write a single, vivid visual prompt for an AI video generator. ' +
    'Output ONLY the prompt text.';

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

  // Called by the dispatcher or by pg_cron, never by a browser. Supabase's
  // verify_jwt gate accepts the anon key, which ships in the site's own
  // bundle, so without this anyone who opened the page could spend a
  // HeyGen render.
  const denied = requireInternalCaller(req);
  if (denied) return denied;

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

  // The same requirements gate the other workers use. A video is the most
  // expensive thing here to get wrong, so it is the last place that should
  // guess at a brief it does not have.
  const product = resolveSku('video', payload);
  const profileForGate = product?.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;
  const missing = missingRequired(specOf(product), payload, profileForGate);
  if (!payload.description || missing.length > 0) {
    const question = missing.length > 0
      ? infoRequest(product?.name ?? 'video', missing)
      : 'No description or brief on this video task -- there is nothing to build one from.';
    await logEvent(taskId, 'requirements_missing', 'worker', { sku: product?.sku, missing });
    await markNeedsInfo(taskId, question);
    await notifyOwner(`${task.public_id} cannot be built yet.\n\n${question}`);
    return jsonResponse({ ok: true, needsInfo: true });
  }

  if (defaulted.length > 0) {
    await logEvent(taskId, 'video_options_defaulted', 'worker', {
      defaulted,
      note: 'Task arrived without these structured choices (owner/free-text intake) -- filled with the cheapest fully-automated defaults.'
    });
  }

  // Normalization above guarantees no-avatar implies 'full', and every clip
  // is short, so this branch has one shape to handle.
  if (payload.avatarStyle === 'none') {
    try {
      const prompt = await generateNoAvatarPrompt(payload);
      const durationSeconds = NO_AVATAR_CLIP_SECONDS;
      const resolution = VIDEO_RESOLUTION;
      const requestId = await submitGrokVideo(prompt, {
        durationSeconds,
        resolution,
        aspectRatio: aspectFor(payload),
        generateAudio: true
      });

      await setProviderJob(taskId, requestId);
      await logEvent(taskId, 'video_submitted', 'worker', { requestId, provider: 'grok-imagine-video', prompt, durationSeconds, resolution, aspect: aspectFor(payload) });

      return jsonResponse({ ok: true, requestId });
    } catch (err) {
      console.error(`worker-video (no-avatar) failed for ${taskId}:`, err);
      await markFailed(taskId, err instanceof Error ? err.message : String(err));
      return jsonResponse({ ok: false, error: 'No-avatar video generation failed' });
    }
  }

  // An avatar clip that reaches this worker was not taken by the external
  // agent who renders them. The only clip this worker can make has nobody
  // speaking in it, so it is held for the owner rather than rendered:
  // delivering a silent scene against an order for a presenter is the wrong
  // product, not a cheaper one, and it would be found by the client rather
  // than by us.
  const held =
    'This one is an avatar clip, which our video specialist renders by hand rather than automatically. ' +
    'It is queued with them now — nothing is needed from you.';
  await logEvent(taskId, 'avatar_video_held', 'worker', {
    note: 'No external agent took this avatar clip, and the built-in path cannot produce a speaking presenter.'
  });
  await markNeedsInfo(taskId, held);
  await notifyOwner(
    `${task.public_id} is an avatar clip and no external agent picked it up.\n\n` +
      'The built-in worker cannot render a speaking presenter, so it is holding. ' +
      'Assign it (/assign 40 grokbot) or deliver it by hand (/deliver ' + task.public_id + ').'
  );
  return jsonResponse({ ok: true, held: true });
}

Deno.serve(handleRequest);
