// Social media requests always come back with at least 3 outputs, never
// just one: image-based requests (post packs, profile kits) get 3 Grok
// image options; copy-based requests (caption packs, Google Business
// Profile content) get a multi-option written document. Invoked by the
// dispatcher with { taskId }.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { generateImageOptions } from '../_shared/images.ts';
import { grokChat } from '../_shared/grok.ts';
import { renderDocumentPdf, type DocSpec } from '../_shared/pdf.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const IMAGE_REQUEST_TYPES = new Set(['posts', 'profile']);
const DEFAULT_OPTION_COUNT = 3;

function platformList(payload: Record<string, unknown>): string {
  const platforms = payload.platforms;
  return Array.isArray(platforms) ? platforms.join(', ') : String(platforms ?? '');
}

function resolveOptionCount(payload: Record<string, unknown>): number {
  const n = Number(payload.optionCount);
  if (!Number.isFinite(n)) return DEFAULT_OPTION_COUNT;
  return Math.min(5, Math.max(1, Math.round(n)));
}

async function handleImageRequest(taskId: string, version: number, payload: Record<string, unknown>) {
  const requestType = String(payload.requestType);
  const prompt =
    requestType === 'profile'
      ? `Social media profile kit (profile picture + cover/banner concept) for ${platformList(payload)}: ${payload.description}. Clean, professional, on-brand.`
      : `Social media post design for ${platformList(payload)}: ${payload.description}. Eye-catching, scroll-stopping, on-brand.`;

  const urls = await generateImageOptions(taskId, prompt, resolveOptionCount(payload), version, payload.referenceFiles);
  await logEvent(taskId, 'social_images_generated', 'worker', { requestType, count: urls.length });
}

async function handleCopyRequest(taskId: string, version: number, payload: Record<string, unknown>) {
  const requestType = String(payload.requestType);
  const brief =
    requestType === 'gbp'
      ? `Write Google Business Profile content: a business description, suggested categories, and an opening post. Brief: ${payload.description}. Platforms context: ${platformList(payload)}.`
      : `Write a caption & hashtag pack (at least 4 distinct caption options with matching hashtags) for ${platformList(payload)}. Brief: ${payload.description}.`;

  const raw = await grokChat(
    [
      {
        role: 'system',
        content:
          'You are a social media copywriter. Produce complete, ready-to-post real content (no placeholders). ' +
          'Respond with ONLY a JSON object of the exact shape ' +
          '{"title": string, "subtitle": string | null, "sections": [{"heading": string, "body": string}]} ' +
          '-- each section is one distinct option/post -- no markdown fences, no commentary.'
      },
      { role: 'user', content: brief }
    ],
    { maxTokens: 4000 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const spec = JSON.parse(cleaned) as DocSpec;
  if (!spec?.title || !Array.isArray(spec?.sections)) {
    throw new Error('Grok returned an unexpected document shape');
  }

  const pdfBytes = await renderDocumentPdf(spec);
  const { url } = await uploadDeliverable(taskId, 'social-content.pdf', pdfBytes, 'application/pdf');
  await addTaskFile(taskId, { url, fileType: 'application/pdf', optionIndex: 1, version });
  await logEvent(taskId, 'social_copy_generated', 'worker', { requestType, url });
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
    const payload = task.payload ?? {};
    const requestType = String(payload.requestType ?? '');

    if (IMAGE_REQUEST_TYPES.has(requestType)) {
      await handleImageRequest(taskId, task.version, payload);
    } else {
      await handleCopyRequest(taskId, task.version, payload);
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
