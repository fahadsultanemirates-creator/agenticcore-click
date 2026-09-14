// Handles the three text/document services (pdf, documents, brand-kit):
// Grok drafts the content, pdf-lib lays it out as a real PDF. QR-code brand-
// kit items are the one exception -- they're delivered as a plain SVG QR
// code rather than forced into a page layout. Invoked by the dispatcher
// with { taskId }.
//
// Note: "Presentation (PowerPoint)" is still delivered as a PDF (one
// section per page) -- there is no solid pure-JS/Deno .pptx writer to lean
// on, and a fake .pptx extension around PDF bytes would be worse than an
// honest PDF. Flagged in task_events so this isn't a silent gap.

import { supabaseAdmin } from '../_shared/storage.ts';
import { grokChat } from '../_shared/grok.ts';
import { renderDocumentPdf, type DocSpec } from '../_shared/pdf.ts';
import { generateQrSvg } from '../_shared/qrcode.ts';
import { uploadDeliverable } from '../_shared/storage.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const QR_ITEMS = new Set(['QR-code business card', 'QR-code table tent']);

function isQrItem(type: string, payload: Record<string, unknown>): boolean {
  return type === 'brand-kit' && QR_ITEMS.has(String(payload.item ?? ''));
}

function describeBrief(type: string, payload: Record<string, unknown>): string {
  if (type === 'pdf') {
    return [
      `Document type: ${payload.docType}`,
      `Brief: ${payload.description}`,
      payload.websiteUrl ? `Reference website (pull branding/copy if useful): ${payload.websiteUrl}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (type === 'documents') {
    return `Document type: ${payload.docType}\nBrief: ${payload.description}`;
  }
  return `Brand kit item: ${payload.item}\nBrief: ${payload.description}`;
}

async function generateDocSpec(type: string, payload: Record<string, unknown>): Promise<DocSpec> {
  const raw = await grokChat(
    [
      {
        role: 'system',
        content:
          'You are a professional business copywriter and document designer. Given a brief, produce the ' +
          'complete, ready-to-use content for the requested document (no placeholder/lorem ipsum text). ' +
          'Respond with ONLY a JSON object of the exact shape ' +
          '{"title": string, "subtitle": string | null, "sections": [{"heading": string, "body": string}]} ' +
          '-- no markdown fences, no commentary.'
      },
      { role: 'user', content: describeBrief(type, payload) }
    ],
    { maxTokens: 4000 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed?.title || !Array.isArray(parsed?.sections)) {
    throw new Error('Grok returned an unexpected document shape');
  }
  return parsed as DocSpec;
}

async function generateQrDeliverable(taskId: string, payload: Record<string, unknown>): Promise<string> {
  const content = await grokChat(
    [
      {
        role: 'system',
        content:
          'Output ONLY the exact short text or URL that should be encoded in a QR code for this request -- ' +
          'nothing else, no explanation, no quotes.'
      },
      { role: 'user', content: String(payload.description ?? '') }
    ],
    { maxTokens: 200, temperature: 0.3 }
  );

  const svg = generateQrSvg(content.trim());
  const { url } = await uploadDeliverable(taskId, 'qr-code.svg', new TextEncoder().encode(svg), 'image/svg+xml');
  return url;
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

    const spec = await generateDocSpec(task.type, payload);
    const pdfBytes = await renderDocumentPdf(spec);
    const { url } = await uploadDeliverable(taskId, 'document.pdf', pdfBytes, 'application/pdf');

    if (String(payload.docType) === 'Presentation (PowerPoint)') {
      await logEvent(taskId, 'pptx_delivered_as_pdf', 'worker', {
        note: 'No Deno-compatible .pptx writer yet -- delivered as a PDF (one section per page) instead.'
      });
    }

    await addTaskFile(taskId, { url, fileType: 'application/pdf', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'document_generated', 'worker', { url, title: spec.title });
    await markDelivered(taskId);
    return jsonResponse({ ok: true, url });
  } catch (err) {
    console.error(`worker-pdf failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Document generation failed' });
  }
}

Deno.serve(handleRequest);
