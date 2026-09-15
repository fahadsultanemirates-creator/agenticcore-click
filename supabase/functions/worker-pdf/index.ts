// Handles the three text/document services (pdf, documents, brand-kit).
// Split into two phases to stay under the edge function execution limit --
// document content generation (Claude, the slow non-deterministic step) can
// alone take most of a 150s budget, and the old single-call version
// (content + cover + per-section images + PDFShift render, all in one
// invocation) silently hit that limit and got killed mid-flight, leaving
// the task stuck in_progress forever with no error logged. Phase 1 (here)
// generates the content + cover image and hands off to worker-pdf-render
// for the section images/layout/PDF render/delivery, so each phase gets
// its own fresh execution window. QR-code brand-kit items are the one
// exception -- fast enough to stay a single phase. Invoked by the
// dispatcher with { taskId }.
//
// Note: "Presentation (PowerPoint)" is still delivered as a PDF (one
// section per page) -- there is no solid pure-JS/Deno .pptx writer to lean
// on, and a fake .pptx extension around PDF bytes would be worse than an
// honest PDF. Flagged in task_events so this isn't a silent gap.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { claudeChat, claudeVisionChat } from '../_shared/claude.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { generateBrandVisual } from '../_shared/images.ts';
import { generateQrSvg } from '../_shared/qrcode.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';
import type { DocSpec } from '../_shared/pdf.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const QR_ITEMS = new Set(['QR-code business card', 'QR-code table tent']);

function isQrItem(type: string, payload: Record<string, unknown>): boolean {
  return type === 'brand-kit' && QR_ITEMS.has(String(payload.item ?? ''));
}

function describeBrief(type: string, payload: Record<string, unknown>): string {
  const description = String(payload.description ?? payload.brief ?? '');
  if (type === 'pdf') {
    return [
      `Document type: ${payload.docType ?? 'General document'}`,
      `Brief: ${description}`,
      payload.websiteUrl ? `Reference website (pull branding/copy if useful): ${payload.websiteUrl}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'documents') {
    return `Document type: ${payload.docType ?? 'General document'}\nBrief: ${description}`;
  }
  return `Brand kit item: ${payload.item ?? 'Brand kit item'}\nBrief: ${description}`;
}

// language: 'en' (default), 'ur', or 'both' -- for 'both', Claude produces
// the same content twice, English sections first then Urdu, each section
// tagged with which language it's in so renderDocumentPdf can switch font
// and RTL direction per section within one document.
async function generateDocSpec(type: string, payload: Record<string, unknown>): Promise<DocSpec> {
  const language = (payload.language as string) === 'ur' || (payload.language as string) === 'both' ? (payload.language as 'ur' | 'both') : 'en';

  const languageInstruction =
    language === 'ur'
      ? 'Write the entire document in Urdu.'
      : language === 'both'
        ? 'Produce the complete document TWICE: first every section in English, then every section again in Urdu ' +
          '(same content, properly translated) -- tag each section with its language.'
        : 'Write the entire document in English.';

  const systemPrompt =
    'You are a professional business copywriter and document designer. Given a brief, produce the ' +
    'complete, ready-to-use content for the requested document (no placeholder/lorem ipsum text). ' +
    'Produce 3 to 6 sections total (up to 12 if writing in both languages) -- enough to properly cover the ' +
    'brief, never padded just to add more. ' +
    `${languageInstruction} ` +
    'Respond with ONLY a JSON object of the exact shape ' +
    '{"title": string, "subtitle": string | null, "sections": [{"heading": string, "body": string, "language": "en"|"ur"}]} ' +
    '-- no markdown fences, no commentary.';
  const userBrief = describeBrief(type, payload);

  const attachments = await fetchAttachments(payload.referenceFiles);
  const raw = attachments.length > 0
    ? await claudeVisionChat(
        `${systemPrompt} You are also given reference image(s) (e.g. an existing logo or brand photos) -- reflect their branding/style in the content and any visual description you write.`,
        userBrief,
        attachments,
        { maxTokens: 8000 }
      )
    : await claudeChat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userBrief }
        ],
        { maxTokens: 8000 }
      );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed?.title || !Array.isArray(parsed?.sections)) {
    throw new Error('Claude returned an unexpected document shape');
  }
  parsed.language = language === 'both' ? 'en' : language;
  return parsed as DocSpec;
}

async function generateQrDeliverable(taskId: string, payload: Record<string, unknown>): Promise<string> {
  const content = await claudeChat(
    [
      {
        role: 'system',
        content:
          'Output ONLY the exact short text or URL that should be encoded in a QR code for this request -- ' +
          'nothing else, no explanation, no quotes.'
      },
      { role: 'user', content: String(payload.description ?? '') }
    ],
    { maxTokens: 200, effort: 'low' }
  );

  const svg = generateQrSvg(content.trim());
  const { url } = await uploadDeliverable(taskId, 'qr-code.svg', new TextEncoder().encode(svg), 'image/svg+xml');
  return url;
}

// Fire-and-forget hand-off to phase 2 (section images + PDF layout +
// delivery) -- gives it its own fresh execution window instead of sharing
// this call's. A pg_cron safety net (pdf-render-sweep) retries this if the
// call gets dropped or worker-pdf-render itself dies mid-render.
function triggerPdfRender(taskId: string): void {
  fetch(`${SUPABASE_URL}/functions/v1/worker-pdf-render`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  }).catch((err) => console.error('worker-pdf: triggerPdfRender failed', err));
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

    if (isQrItem(task.type, payload)) {
      const url = await generateQrDeliverable(taskId, payload);
      await addTaskFile(taskId, { url, fileType: 'image/svg+xml', optionIndex: 1, version: task.version });
      await logEvent(taskId, 'qr_generated', 'worker', { url });
      await markDelivered(taskId);
      return jsonResponse({ ok: true, url });
    }

    const [spec, coverImageUrl] = await Promise.all([
      generateDocSpec(task.type, payload),
      generateBrandVisual(
        taskId,
        `A professional cover visual for a business document about: ${describeBrief(task.type, payload)}. Abstract, on-topic imagery -- not literal text or icons of the topic name.`,
        'cover.png'
      )
    ]);
    spec.coverImageUrl = coverImageUrl;

    const { error: updateError } = await supabaseAdmin
      .from('tasks')
      .update({ payload: { ...payload, pendingSpec: spec }, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (updateError) throw new Error(`Could not persist doc spec: ${updateError.message}`);

    await logEvent(taskId, 'doc_spec_ready', 'worker', { title: spec.title, sections: spec.sections.length });
    triggerPdfRender(taskId);

    return jsonResponse({ ok: true, phase: 'spec_ready' });
  } catch (err) {
    console.error(`worker-pdf failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Document generation failed' });
  }
}

Deno.serve(handleRequest);
