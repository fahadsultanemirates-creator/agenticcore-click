// Grok-driven image generation -- always 5 options, per the service's own
// promise (one flat price, five images to choose from). Invoked by the
// dispatcher with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { generateImageOptions } from '../_shared/images.ts';
import { resolveSku } from '../_shared/catalog.ts';
import { getBrandProfile, brandStyleForPrompt, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import { sendTelegramPhoto } from '../_shared/telegramApi.ts';
import { logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const DEFAULT_OPTION_COUNT = 5;


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

function buildPrompt(payload: Record<string, unknown>): string {
  const imageType = String(payload.imageType ?? 'image');
  const description = String(payload.description ?? payload.brief ?? '');
  return `${imageType}: ${description}. High quality, professional, ready to use commercially.`;
}

// How many options a product returns is part of what was sold, so it comes
// from the catalog. An explicit payload value may narrow it but never exceed
// the product's promise.
function resolveOptionCount(payload: Record<string, unknown>, catalogCount?: number): number {
  const promised = catalogCount ?? DEFAULT_OPTION_COUNT;
  const n = Number(payload.optionCount);
  if (!Number.isFinite(n)) return promised;
  return Math.min(promised, Math.max(1, Math.round(n)));
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
    const prompt = buildPrompt(payload);
    const product = resolveSku(task.type, payload);
    const profile = product?.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;
    const urls = await generateImageOptions(taskId, prompt + brandStyleForPrompt(profile) + revisionInstruction(payload), resolveOptionCount(payload, product?.output.options), task.version, payload.referenceFiles);
    await logEvent(taskId, 'images_generated', 'worker', { count: urls.length });

    if (task.owner_channel_id) {
      const chatId = Number(task.owner_channel_id);
      for (let i = 0; i < urls.length; i++) {
        await sendTelegramPhoto(chatId, urls[i], `Option ${i + 1} of ${urls.length} -- ${taskId}`).catch((err) =>
          console.error(`worker-image: sendTelegramPhoto failed for ${taskId}:`, err)
        );
      }
    }

    await markDelivered(taskId);
    return jsonResponse({ ok: true, urls });
  } catch (err) {
    console.error(`worker-image failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Image generation failed' });
  }
}

Deno.serve(handleRequest);
