// Social media requests always come back with at least 3 outputs, never
// just one: image-based requests (post packs, profile kits) get 3 Grok
// image options; copy-based requests (caption packs, Google Business
// Profile content) get a multi-option written document. Invoked by the
// dispatcher with { taskId }.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { generateImageOptions } from '../_shared/images.ts';
import { resolveSku } from '../_shared/catalog.ts';
import { getBrandProfile, brandFactsForPrompt, brandStyleForPrompt, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import { claudeChat } from '../_shared/claude.ts';
import { renderDocumentPdf, type DocSpec } from '../_shared/pdf.ts';
import { sendTelegramDocument, sendTelegramPhoto } from '../_shared/telegramApi.ts';
import { notifyOwner } from '../_shared/telegram.ts';
import { addTaskFile, logEvent, markDelivered, markFailed, markNeedsInfo } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const IMAGE_REQUEST_TYPES = new Set(['posts', 'profile']);
const DEFAULT_OPTION_COUNT = 3;
const REQUEST_TYPES = ['posts', 'profile', 'captions', 'gbp'];
const DEFAULT_PLATFORMS = ['Instagram', 'Facebook'];

// Owner-sourced tasks (Telegram /new, or a free-text brief the bot's
// classifier turned into a task) carry only payload.brief, so requestType,
// platforms and description were all missing here. Unnormalized that didn't
// fail -- it produced a caption pack whose prompt literally read "for
// undefined ... Brief: undefined", which is worse than an error because it
// still marks the task delivered. The brief becomes the description (same
// `?? payload.brief` convention as worker-image/worker-pdf); requestType is
// read off the brief's own wording when the form didn't set it, since the
// four kinds produce genuinely different deliverables (images vs. copy) and
// guessing "posts" for an obvious caption request would hand back the wrong
// thing entirely.
function inferRequestType(description: string): string {
  const text = description.toLowerCase();
  if (/google business|gbp|google profile/.test(text)) return 'gbp';
  if (/caption|hashtag/.test(text)) return 'captions';
  if (/profile (pic|picture|kit)|banner|cover photo|avatar/.test(text)) return 'profile';
  return 'posts';
}

interface SocialDefaulting {
  payload: Record<string, unknown>;
  defaulted: string[];
}

function normalizeSocialPayload(raw: Record<string, unknown>): SocialDefaulting {
  const payload = { ...raw };
  const defaulted: string[] = [];

  const description = String(payload.description ?? payload.brief ?? '').trim();
  if (description) payload.description = description;

  if (!REQUEST_TYPES.includes(String(payload.requestType))) {
    payload.requestType = inferRequestType(description);
    defaulted.push(`requestType=${payload.requestType}`);
  }

  if (!Array.isArray(payload.platforms) || payload.platforms.length === 0) {
    payload.platforms = DEFAULT_PLATFORMS;
    defaulted.push(`platforms=${DEFAULT_PLATFORMS.join('/')}`);
  }

  return { payload, defaulted };
}


// The client's site is the brand reference for every product that carries
// their branding -- explicit field first, then any URL in the brief.
function brandUrlFor(payload: Record<string, unknown>): string | null {
  const explicit = typeof payload.websiteUrl === 'string' ? payload.websiteUrl : null;
  return normalizeUrl(explicit ?? '') ?? extractUrl(String(payload.description ?? payload.brief ?? ''));
}

function platformList(payload: Record<string, unknown>): string {
  const platforms = payload.platforms;
  return Array.isArray(platforms) ? platforms.join(', ') : String(platforms ?? '');
}

// As in worker-image: the catalog states what the product promises.
function resolveOptionCount(payload: Record<string, unknown>, catalogCount?: number): number {
  const promised = catalogCount ?? DEFAULT_OPTION_COUNT;
  const n = Number(payload.optionCount);
  if (!Number.isFinite(n)) return promised;
  return Math.min(promised, Math.max(1, Math.round(n)));
}

async function handleImageRequest(
  taskId: string,
  publicId: string,
  version: number,
  payload: Record<string, unknown>,
  ownerChannelId: string | null
) {
  const requestType = String(payload.requestType);
  const prompt =
    requestType === 'profile'
      ? `Social media profile kit (profile picture + cover/banner concept) for ${platformList(payload)}: ${payload.description}. Clean, professional, on-brand.`
      : `Social media post design for ${platformList(payload)}: ${payload.description}. Eye-catching, scroll-stopping, on-brand.`;

  const product = resolveSku('social', payload);
  const profile = product?.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;
  const urls = await generateImageOptions(taskId, prompt + brandStyleForPrompt(profile), resolveOptionCount(payload, product?.output.options), version, payload.referenceFiles);
  await logEvent(taskId, 'social_images_generated', 'worker', { requestType, count: urls.length });

  if (ownerChannelId) {
    const chatId = Number(ownerChannelId);
    for (let i = 0; i < urls.length; i++) {
      await sendTelegramPhoto(chatId, urls[i], `Option ${i + 1} of ${urls.length} -- ${publicId}`).catch((err) =>
        console.error(`worker-social: sendTelegramPhoto failed for ${taskId}:`, err)
      );
    }
  }
}

async function handleCopyRequest(taskId: string, version: number, payload: Record<string, unknown>): Promise<{ url: string; title: string }> {
  const requestType = String(payload.requestType);
  const brief =
    requestType === 'gbp'
      ? `Write Google Business Profile content: a business description, suggested categories, and an opening post. Brief: ${payload.description}. Platforms context: ${platformList(payload)}.`
      : `Write a caption & hashtag pack (at least 4 distinct caption options with matching hashtags) for ${platformList(payload)}. Brief: ${payload.description}.`;

  const profile = await getBrandProfile(brandUrlFor(payload));
  const briefWithBrand = brief + brandFactsForPrompt(profile);

  const raw = await claudeChat(
    [
      {
        role: 'system',
        content:
          'You are a social media copywriter. Produce complete, ready-to-post real content (no placeholders). ' +
          'Respond with ONLY a JSON object of the exact shape ' +
          '{"title": string, "subtitle": string | null, "sections": [{"heading": string, "body": string}]} ' +
          '-- each section is one distinct option/post -- no markdown fences, no commentary.'
      },
      { role: 'user', content: briefWithBrand }
    ],
    { maxTokens: 4000 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const spec = JSON.parse(cleaned) as DocSpec;
  if (!spec?.title || !Array.isArray(spec?.sections)) {
    throw new Error('Claude returned an unexpected document shape');
  }

  const pdfBytes = await renderDocumentPdf(spec);
  const { url } = await uploadDeliverable(taskId, 'social-content.pdf', pdfBytes, 'application/pdf');
  await addTaskFile(taskId, { url, fileType: 'application/pdf', optionIndex: 1, version });
  await logEvent(taskId, 'social_copy_generated', 'worker', { requestType, url });
  return { url, title: spec.title };
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

  try {
    const { payload, defaulted } = normalizeSocialPayload(task.payload ?? {});
    const requestType = String(payload.requestType ?? '');

    // No brief at all means there is nothing to design or write from --
    // stop before generating images off an empty prompt.
    if (!payload.description) {
      await markNeedsInfo(taskId, 'No description/brief on this social task -- nothing to generate from.');
      await notifyOwner(`${task.public_id} has no brief text, so there's nothing to build social content from. Send the brief and re-queue it.`);
      return jsonResponse({ ok: true, needsInfo: true });
    }

    if (defaulted.length > 0) {
      await logEvent(taskId, 'social_options_defaulted', 'worker', {
        defaulted,
        note: 'Task arrived without these structured choices (owner/free-text intake) -- filled from the brief text and defaults.'
      });
    }

    if (IMAGE_REQUEST_TYPES.has(requestType)) {
      await handleImageRequest(taskId, task.public_id, task.version, payload, task.owner_channel_id);
    } else {
      const { url, title } = await handleCopyRequest(taskId, task.version, payload);
      // Owner-created (via Telegram /new) tasks get the actual PDF in the
      // chat, not just a Dashboard entry.
      if (task.owner_channel_id) {
        await sendTelegramDocument(Number(task.owner_channel_id), url, `${task.public_id} — ${title}`).catch((err) =>
          console.error('worker-social: sendTelegramDocument failed', err)
        );
      }
    }

    await markDelivered(taskId);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(`worker-social failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Social content generation failed' });
  }
}

Deno.serve(handleRequest);
