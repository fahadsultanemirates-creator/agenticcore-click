// Phase 2 of document generation (see worker-pdf's header for phase 1 and
// why this is split out): given a task whose payload.pendingSpec was
// already produced by worker-pdf, this generates the per-section
// illustrations, renders the final PDF, uploads it, and delivers it
// (Dashboard + Telegram for owner tasks). Invoked by worker-pdf's
// fire-and-forget hand-off, or by the pdf-render-sweep cron safety net if
// that hand-off got dropped or a previous run of this function died
// mid-render.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { renderDocumentPdf, renderBrandKitAsset, type DocSpec, type DocSection } from '../_shared/pdf.ts';
import { generateBrandVisual, mapWithConcurrency } from '../_shared/images.ts';
import { sendTelegramDocument } from '../_shared/telegramApi.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

// One real illustration per section, tied to that section's own heading/body
// -- the same fix applied to the business report -- so a short section
// doesn't leave the rest of its page blank once the body text runs out.
async function generateSectionVisuals(taskId: string, sections: DocSection[]): Promise<void> {
  const images = await mapWithConcurrency(sections, 4, (section, i) =>
    generateBrandVisual(
      taskId,
      `A small abstract illustration for this specific point from a business document: "${section.heading}" -- ` +
        `${section.body} Represent the concrete idea itself, not literal text or icons of the words.`,
      `section-${i + 1}.png`
    )
  );
  sections.forEach((section, i) => {
    section.imageUrl = images[i];
  });
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

  // Already finished by an earlier run of this same phase -- the cron
  // sweep can race a slow-but-successful call, this is the no-op path.
  if (task.status === 'delivered') {
    return jsonResponse({ ok: true, alreadyDelivered: true });
  }

  const payload = task.payload ?? {};
  const spec = payload.pendingSpec as DocSpec | undefined;
  if (!spec || !Array.isArray(spec.sections)) {
    return jsonResponse({ error: 'No pending document spec on this task' }, 400);
  }

  try {
    const isAsset = spec.kind === 'asset';
    if (!isAsset) {
      await generateSectionVisuals(taskId, spec.sections);
    }
    const pdfBytes = isAsset ? await renderBrandKitAsset(spec) : await renderDocumentPdf(spec);
    const { url } = await uploadDeliverable(taskId, isAsset ? 'brand-asset.pdf' : 'document.pdf', pdfBytes, 'application/pdf');

    if (String(payload.docType) === 'Presentation (PowerPoint)') {
      await logEvent(taskId, 'pptx_delivered_as_pdf', 'worker', {
        note: 'No Deno-compatible .pptx writer yet -- delivered as a PDF (one section per page) instead.'
      });
    }

    await addTaskFile(taskId, { url, fileType: 'application/pdf', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'document_generated', 'worker', { url, title: spec.title });
    await markDelivered(taskId);

    // Owner-created (via Telegram /new) tasks get the actual file in the
    // chat, not just a Dashboard entry -- website-sourced ones have no
    // owner_channel_id and are unaffected (the client sees it in their
    // own Dashboard instead).
    if (task.owner_channel_id) {
      await sendTelegramDocument(Number(task.owner_channel_id), url, `${task.public_id} — ${spec.title}`).catch((err) =>
        console.error('worker-pdf-render: sendTelegramDocument failed', err)
      );
    }

    return jsonResponse({ ok: true, url });
  } catch (err) {
    console.error(`worker-pdf-render failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Document rendering failed' });
  }
}

Deno.serve(handleRequest);
