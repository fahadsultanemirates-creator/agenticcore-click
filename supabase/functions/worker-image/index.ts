// Grok-driven image generation -- always 5 options, per the service's own
// promise (one flat price, five images to choose from). Invoked by the
// dispatcher with { taskId }.

import { supabaseAdmin } from '../_shared/storage.ts';
import { generateImageOptions } from '../_shared/images.ts';
import { sendTelegramPhoto } from '../_shared/telegramApi.ts';
import { logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const DEFAULT_OPTION_COUNT = 5;

function buildPrompt(payload: Record<string, unknown>): string {
  const imageType = String(payload.imageType ?? 'image');
  const description = String(payload.description ?? payload.brief ?? '');
  return `${imageType}: ${description}. High quality, professional, ready to use commercially.`;
}

function resolveOptionCount(payload: Record<string, unknown>): number {
  const n = Number(payload.optionCount);
  if (!Number.isFinite(n)) return DEFAULT_OPTION_COUNT;
  return Math.min(5, Math.max(1, Math.round(n)));
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
    const urls = await generateImageOptions(taskId, prompt, resolveOptionCount(payload), task.version, payload.referenceFiles);
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
