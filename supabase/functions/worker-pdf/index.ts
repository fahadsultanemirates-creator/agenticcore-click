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
import { getBrandProfile, brandFactsForPrompt, extractUrl, normalizeUrl, type BrandProfile } from '../_shared/brandProfile.ts';
import { stationeryFooterLines } from '../_shared/brandScrape.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;



// Which URL this product should learn the client's brand from: the explicit
// field when the form collected one, otherwise a URL mentioned in the brief,
// so "a letterhead for mybakery.com" works without a separate field.
function brandUrlFor(payload: Record<string, unknown>): string | null {
  const explicit = typeof payload.websiteUrl === 'string' ? payload.websiteUrl : null;
  return normalizeUrl(explicit ?? '') ?? extractUrl(String(payload.description ?? payload.brief ?? ''));
}

// Design values go to the renderer only. A generator told about colours
// writes about colours -- that is how "(deep navy header band)" ended up
// printed as body text on a letterhead.
function brandColors(profile: BrandProfile | null): { primaryColor?: string; accentColor?: string } {
  return { primaryColor: profile?.primaryColor, accentColor: profile?.accentColor };
}

// Colours plus a pointer to the logo. Deliberately the URL and not the image:
// this spec is persisted into tasks.payload between the two phases, and
// payload is selected by every order listing -- inlining a 500KB logo here
// would mean dragging ~700KB of base64 through each of those queries. The
// render phase fetches and inlines it at the moment it is actually needed.
function brandAssets(
  profile: BrandProfile | null,
  payload: Record<string, unknown> = {}
): { primaryColor?: string; accentColor?: string; logoUrl?: string } {
  return { ...brandColors(profile), logoUrl: clientLogoUrl(payload) ?? profile?.logoUrl };
}

// A file the client attached beats anything scraped off their site.
//
// The scraper takes the first plausible image it finds -- og:image, an
// apple-touch-icon, a favicon -- which is a guess, and on a letterhead it
// showed up as a tiny dark favicon square even though the real logo had been
// attached to the very same message. Something handed over deliberately is
// not a guess, so it wins.
const IMAGE_EXTENSION = /\.(png|jpe?g|svg|webp|gif)(?:\?|$)/i;

function clientLogoUrl(payload: Record<string, unknown>): string | undefined {
  const files = payload.referenceFiles;
  if (!Array.isArray(files)) return undefined;
  const urls = files.filter((file): file is string => typeof file === 'string' && file.trim() !== '');
  // Prefer something that names itself an image; fall back to the first
  // attachment, since Supabase storage URLs do not always carry an extension.
  return urls.find((url) => IMAGE_EXTENSION.test(url)) ?? urls[0];
}

async function generateAssetSpec(catalogItem: CatalogItem, payload: Record<string, unknown>): Promise<DocSpec> {
  const item = catalogItem.name;
  const description = String(payload.description ?? payload.brief ?? '');
  const profile = catalogItem.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;

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

  const userBrief = [`Product: ${item}`, `Brief: ${description}`].filter(Boolean).join('\n') + brandFactsForPrompt(profile) + revisionInstruction(payload);

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
  return { title: String(parsed.title), sections: [parsed.sections[0]], kind: 'asset', brand: brandAssets(profile, payload) };
}

// Stationery is a different shape, not a different prompt over the same shape.
// Asked for a letterhead through the one-block asset schema, the model had
// nowhere to put "header" and "footer" separately and no way to express an
// empty middle -- so it filled the page with a letter template ("[Date]",
// "Dear [Name]", "[Letter text]"). The schema itself now carries the two
// printed zones, and the emptiness between them is the renderer's job.
async function generateStationerySpec(catalogItem: CatalogItem, payload: Record<string, unknown>): Promise<DocSpec> {
  const description = String(payload.description ?? payload.brief ?? '');
  const profile = catalogItem.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;

  const systemPrompt =
    `${shapeInstruction(catalogItem)} ` +
    'Return the business name, and at most two short supporting lines for the identity block at the top of ' +
    'every sheet -- a tagline and/or what they do. Do NOT repeat the business name inside those supporting ' +
    'lines; it is printed separately above them. The contact strip at the foot is assembled from the ' +
    "client's own recorded details, so do not write it. Write no design instructions, no colours, no fonts, " +
    'no brackets, no placeholders of any kind. Respond with ONLY a JSON object of the exact shape ' +
    '{"businessName": string, "headerLines": string[]} -- no markdown fences, no commentary.';

  const userBrief = [`Product: ${catalogItem.name}`, `Brief: ${description}`].filter(Boolean).join('\n') +
    brandFactsForPrompt(profile) + revisionInstruction(payload);

  const raw = await claudeChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userBrief }
    ],
    { maxTokens: 900 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  const headerLines = Array.isArray(parsed?.headerLines) ? parsed.headerLines.map(String) : [];

  // Prefer the name the site states about itself over one the model retyped.
  const businessName = String(profile?.businessName ?? parsed?.businessName ?? '').trim();
  if (!businessName) throw new Error('Claude returned stationery with no business name');

  // Built from the profile, not written: composing it left one of four social
  // channels off the page to satisfy an instruction about line count.
  const footerLines = stationeryFooterLines(profile);

  return {
    title: businessName,
    // Kept for callers that read sections; the stationery renderer ignores it.
    sections: [{ heading: '', body: '' }],
    kind: 'asset',
    brand: brandAssets(profile, payload),
    // footerLines is not truncated: it is exactly what the site publishes, and
    // dropping a channel to hit a line count is the bug this replaced.
    stationery: { businessName, headerLines: headerLines.slice(0, 2), footerLines }
  };
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
    'EACH SECTION IS ONE PRINTED PAGE and must be complete on it: aim for 90-140 words of body, and never ' +
    'exceed 200. A section that runs longer is the wrong shape -- split the idea into two sections, each ' +
    'self-contained under its own heading, rather than writing one long one. Do not end a section mid-thought ' +
    'expecting it to continue into the next; a reader turning the page starts a new topic. ' +
    `${languageInstruction} ` +
    'Respond with ONLY a JSON object of the exact shape ' +
    '{"title": string, "subtitle": string | null, "sections": [{"heading": string, "body": string, "language": "en"|"ur"}]} ' +
    '-- no markdown fences, no commentary.';
  const profile = catalogItem.urlUse === 'brand' ? await getBrandProfile(brandUrlFor(payload)) : null;
  const userBrief = describeBrief(type, payload) + brandFactsForPrompt(profile) + revisionInstruction(payload);

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
  parsed.brand = brandColors(profile);
  // Whose document this is. Only the owner's business report wears our brand.
  parsed.branding = catalogItem.branding;
  // Our own name belongs on our own documents only; a client's cover says what
  // the document is instead.
  parsed.eyebrow = catalogItem.branding === 'client' ? catalogItem.name : undefined;

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
      const spec =
        catalogItem.layout === 'stationery'
          ? await generateStationerySpec(catalogItem, payload)
          : await generateAssetSpec(catalogItem, payload);

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
