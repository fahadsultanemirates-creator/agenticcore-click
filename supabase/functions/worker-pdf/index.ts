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
import { screenshotUrl } from '../_shared/htmlPdf.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';
import type { DocSpec } from '../_shared/pdf.ts';
import { resolveSku, shapeInstruction, type CatalogItem } from '../_shared/catalog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;



function extractUrl(text: string): string | undefined {
  const httpMatch = text.match(/https?:\/\/[^\s)]+/i);
  if (httpMatch) return httpMatch[0];
  const bareMatch = text.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:agency|click|com|io|co|net|org|ai)\b/i);
  return bareMatch ? `https://${bareMatch[0]}` : undefined;
}

// Best-effort real-branding match: screenshots the referenced site and asks
// Claude to pick out its two defining hex colors, so a brand-kit asset can
// carry a real accent instead of a generic gray one. Structured (not prose)
// on purpose -- renderBrandKitAsset applies these as real CSS, so the
// content model never has to describe colors/layout in the text itself
// (which produced fake design-annotation text like "(navy header band,
// cyan rule)" printed as if it were real page content). Never blocks the
// task on failure -- an unreachable/odd URL just means no brand colors.
interface WebsiteBrand {
  primaryColor?: string;
  accentColor?: string;
}

async function describeReferenceWebsiteBrand(url: string): Promise<WebsiteBrand> {
  try {
    const png = await screenshotUrl(url, '1440x900', false);
    const raw = await claudeVisionChat(
      "Identify this website's two most defining brand colors as hex codes: a primary/dark color and an " +
        'accent color used for highlights, links, or buttons. Respond with ONLY a JSON object of the exact ' +
        'shape {"primaryColor": "#rrggbb", "accentColor": "#rrggbb"} -- no markdown fences, no commentary. If ' +
        'you genuinely cannot tell, respond with {}.',
      "Identify this website's brand colors.",
      [{ bytes: png, mimeType: 'image/png' }],
      { maxTokens: 150 }
    );
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    const hex = /^#[0-9a-f]{6}$/i;
    return {
      primaryColor: typeof parsed?.primaryColor === 'string' && hex.test(parsed.primaryColor) ? parsed.primaryColor : undefined,
      accentColor: typeof parsed?.accentColor === 'string' && hex.test(parsed.accentColor) ? parsed.accentColor : undefined
    };
  } catch (err) {
    console.error('worker-pdf: describeReferenceWebsiteBrand failed', err);
    return {};
  }
}

// Brand-kit's non-QR items (letterhead, email signature, price list,
// "coming soon" page, style guide one-pager, name/tagline generator) are
// each meant to be one small, immediately usable asset -- per the service's
// own framing ("~10 min", "from $10") -- not a multi-page specification
// document. This produces exactly one section of real, finished content
// (never a report), and rendered via renderBrandKitAsset carries none of
// .click's own report theme, since the deliverable is the CLIENT's brand,
// not ours.
async function generateAssetSpec(catalogItem: CatalogItem, payload: Record<string, unknown>): Promise<DocSpec> {
  const item = catalogItem.name;
  const description = String(payload.description ?? payload.brief ?? '');
  const url = typeof payload.websiteUrl === 'string' ? payload.websiteUrl : extractUrl(description);
  const brand = url ? await describeReferenceWebsiteBrand(url) : {};

  const systemPrompt =
    `${shapeInstruction(catalogItem)} ` +
    'You produce the ACTUAL finished asset requested, ready to use immediately -- not a specification, not an ' +
    'explanation, not a design brief. Write ONLY the real words a person reads: names, dates, addresses, body ' +
    'copy, signatures, prices, headlines. NEVER describe colors, fonts, layout, spacing, logos, or any other ' +
    'visual design element in the text, even in brackets or parentheses -- design is handled separately, ' +
    'outside your output, so writing about it just prints as garbage placeholder text on the page. Keep it ' +
    'exactly as short as the real item actually is: a letterhead needs only a header line and a footer contact ' +
    'block; an email signature needs 4-6 lines; a price list needs real items and prices; a "coming soon" page ' +
    'needs a short headline and one line of body copy; a style guide one-pager needs a few punchy points, not ' +
    'paragraphs; a name/tagline generator needs a short list of options. Respond with ONLY a JSON object of the ' +
    'exact shape {"title": string, "sections": [{"heading": string, "body": string}]} with EXACTLY ONE entry in ' +
    '"sections" -- no markdown fences, no commentary.';

  const userBrief = [`Brand kit item: ${item}`, `Brief: ${description}`].filter(Boolean).join('\n');

  const raw = await claudeChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userBrief }
    ],
    { maxTokens: 1500 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed?.title || !Array.isArray(parsed?.sections) || parsed.sections.length === 0) {
    throw new Error('Claude returned an unexpected asset shape');
  }
  // One section, enforced here rather than trusted from the model.
  return { title: String(parsed.title), sections: [parsed.sections[0]], kind: 'asset', brand };
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
async function generateDocSpec(catalogItem: CatalogItem, type: string, payload: Record<string, unknown>): Promise<DocSpec> {
  const language = (payload.language as string) === 'ur' || (payload.language as string) === 'both' ? (payload.language as 'ur' | 'both') : 'en';

  const languageInstruction =
    language === 'ur'
      ? 'Write the entire document in Urdu.'
      : language === 'both'
        ? 'Produce the complete document TWICE: first every section in English, then every section again in Urdu ' +
          '(same content, properly translated) -- tag each section with its language.'
        : 'Write the entire document in English.';

  const systemPrompt =
    `${shapeInstruction(catalogItem)} ` +
    'You are a professional business copywriter and document designer. Given a brief, produce the ' +
    'complete, ready-to-use content for the requested document (no placeholder/lorem ipsum text). ' +
    'Use only as many sections as the brief genuinely needs, never padded just to add more. ' +
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

  // The prompt asks for the cap; this enforces it. Bilingual documents carry
  // each section twice, so the ceiling doubles for them.
  const cap = catalogItem.output.maxPages;
  if (cap !== undefined) {
    const limit = language === 'both' ? cap * 2 : cap;
    if (parsed.sections.length > limit) {
      parsed.sections = parsed.sections.slice(0, limit);
    }
  }
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

    // Which product this is decides the shape, the renderer and whose brand
    // it wears -- not the task type, which covers several different products.
    // A business card and a brochure are both type "pdf" but one is a single
    // finished page and the other a multi-page booklet.
    const catalogItem = resolveSku(task.type, payload);
    if (!catalogItem) {
      await markFailed(taskId, `No catalog product matches ${task.type} with this payload -- cannot determine the deliverable's shape.`);
      return jsonResponse({ ok: false, error: 'Unrecognized product' });
    }
    await logEvent(taskId, 'product_identified', 'worker', {
      sku: catalogItem.sku,
      code: catalogItem.code,
      renderer: catalogItem.renderer,
      branding: catalogItem.branding,
      output: catalogItem.output
    });

    if (catalogItem.renderer === 'qr') {
      const url = await generateQrDeliverable(taskId, payload);
      await addTaskFile(taskId, { url, fileType: 'image/svg+xml', optionIndex: 1, version: task.version });
      await logEvent(taskId, 'qr_generated', 'worker', { url });
      await markDelivered(taskId);
      return jsonResponse({ ok: true, url });
    }

    // Single-page finished artifacts: letterheads, business cards, flyers,
    // banners, invoices, one-page plans. Previously only brand-kit reached
    // this path, so a "Business card" PDF was built as a multi-page deck in
    // our own theme -- the same failure as the letterhead, just unreported.
    if (catalogItem.renderer === 'asset') {
      const spec = await generateAssetSpec(catalogItem, payload);

      const { error: assetUpdateError } = await supabaseAdmin
        .from('tasks')
        .update({ payload: { ...payload, pendingSpec: spec }, updated_at: new Date().toISOString() })
        .eq('id', taskId);
      if (assetUpdateError) throw new Error(`Could not persist asset spec: ${assetUpdateError.message}`);

      await logEvent(taskId, 'doc_spec_ready', 'worker', { title: spec.title, kind: 'asset', sku: catalogItem.sku });
      triggerPdfRender(taskId);

      return jsonResponse({ ok: true, phase: 'spec_ready' });
    }

    const [spec, coverImageUrl] = await Promise.all([
      generateDocSpec(catalogItem, task.type, payload),
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

    await logEvent(taskId, 'doc_spec_ready', 'worker', { title: spec.title, sections: spec.sections.length, sku: catalogItem.sku });
    triggerPdfRender(taskId);

    return jsonResponse({ ok: true, phase: 'spec_ready' });
  } catch (err) {
    console.error(`worker-pdf failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Document generation failed' });
  }
}

Deno.serve(handleRequest);
