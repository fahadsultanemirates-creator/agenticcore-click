// Owner-only: given a URL, screenshots it (desktop + mobile) so Grok can
// actually see the site rather than just reason about raw markup, then
// produces a three-part deck -- flaws, improvements, social marketing
// plan -- rendered as a .click-branded PDF (dark theme, big mobile-legible
// type, one topic per page). Invoked by the dispatcher with { taskId }.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { grokVisionChat } from '../_shared/grok.ts';
import { screenshotUrl } from '../_shared/htmlPdf.ts';
import { generateBrandVisual } from '../_shared/images.ts';
import { renderDocumentPdf, type DocSection } from '../_shared/pdf.ts';
import { sendBotMessage, getOwnerLanguage } from '../_shared/botMessage.ts';
import { sendTelegramDocument } from '../_shared/telegramApi.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

interface ReportSlide {
  heading: string;
  body: string;
}

interface ReportContent {
  flaws: ReportSlide[];
  improvements: ReportSlide[];
  marketingPlan: ReportSlide[];
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgenticCoreReportBot/1.0)' } });
    const html = await resp.text();
    return html.slice(0, 20000);
  } catch (err) {
    console.error('worker-business-report: could not fetch page HTML', err);
    return '(Could not fetch page HTML -- rely on the screenshots.)';
  }
}

async function analyzeSite(url: string, desktopShot: Uint8Array, mobileShot: Uint8Array, html: string): Promise<ReportContent> {
  const raw = await grokVisionChat(
    'You are a senior web design, UX, and digital marketing consultant preparing a client-facing report. ' +
      'You are given a desktop screenshot, a mobile screenshot, and the raw HTML of a business website. ' +
      'Produce a report in exactly three parts: (1) flaws -- concrete problems with the design, theme, layout, ' +
      'or content, (2) improvements -- specific, actionable fixes for those flaws, (3) marketingPlan -- a full ' +
      'social media marketing plan for this business (platforms, content types, posting cadence, campaign ideas). ' +
      'Each part is an array of slides, each with a short heading and a short body (2-4 sentences, plain ' +
      'professional language -- no code, no HTML, no symbols like # @ * / no markdown). Aim for 3-5 slides per ' +
      'part, 9-15 total -- each slide gets its own generated illustration afterward, so keep the count focused ' +
      'rather than padded. Respond with ONLY JSON: ' +
      '{"flaws":[{"heading":"","body":""}],"improvements":[{"heading":"","body":""}],"marketingPlan":[{"heading":"","body":""}]}',
    `Website: ${url}\n\nRaw HTML (truncated):\n${html}`,
    [
      { bytes: desktopShot, mimeType: 'image/png' },
      { bytes: mobileShot, mimeType: 'image/png' }
    ],
    { maxTokens: 8000 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed?.flaws) || !Array.isArray(parsed?.improvements) || !Array.isArray(parsed?.marketingPlan)) {
    throw new Error('Grok returned an unexpected report shape');
  }
  return parsed as ReportContent;
}

function toSections(
  content: ReportContent,
  dividerImages: [string, string, string],
  slideImages: { flaws: string[]; improvements: string[]; marketing: string[] }
): DocSection[] {
  const divider = (title: string, imageUrl: string): DocSection => ({ heading: title, body: '', imageUrl });
  const withImages = (slides: ReportSlide[], images: string[]): DocSection[] =>
    slides.map((s, i) => ({ ...s, imageUrl: images[i] }));
  return [
    divider('Part 1 — Website & Theme Flaws', dividerImages[0]),
    ...withImages(content.flaws, slideImages.flaws),
    divider('Part 2 — Recommended Improvements', dividerImages[1]),
    ...withImages(content.improvements, slideImages.improvements),
    divider('Part 3 — Social Media Marketing Plan', dividerImages[2]),
    ...withImages(content.marketingPlan, slideImages.marketing)
  ];
}

// Real generated visuals, not stock icons -- a cover hero plus one image
// per report part, all in the same brand style so the deck reads as
// designed rather than a plain text dump. Generated in parallel with the
// screenshot/analysis flow (they don't depend on its output) to avoid
// adding extra wall-clock time.
async function generateReportVisuals(taskId: string): Promise<{ cover: string; dividers: [string, string, string] }> {
  const [cover, flaws, improvements, marketing] = await Promise.all([
    generateBrandVisual(taskId, 'A professional website audit and business report cover visual: abstract dashboard screens, growth charts, and analytical data elements.', 'cover.png'),
    generateBrandVisual(taskId, 'An abstract visual representing finding flaws and problems in a design review: a magnifying glass, warning marks, subtle cracked geometric shapes.', 'divider-flaws.png'),
    generateBrandVisual(taskId, 'An abstract visual representing growth and improvement: upward arrows, ascending bars, a glowing lightbulb, positive transformation.', 'divider-improvements.png'),
    generateBrandVisual(taskId, 'An abstract visual representing social media marketing and digital campaigns: connected network nodes, engagement icons, a megaphone shape.', 'divider-marketing.png')
  ]);
  return { cover, dividers: [flaws, improvements, marketing] };
}

// One real illustration per individual slide, tied to that slide's own
// heading/body -- not a generic filler image -- so every page carries
// something specific to the point being made instead of leaving the rest
// of the page blank once the (short) body text runs out.
async function generateSlideVisuals(taskId: string, slides: ReportSlide[], filePrefix: string, topicHint: string): Promise<string[]> {
  return Promise.all(
    slides.map((slide, i) =>
      generateBrandVisual(
        taskId,
        `A small abstract illustration for this specific point from a ${topicHint}: "${slide.heading}" -- ${slide.body} ` +
          'Represent the concrete idea itself, not literal text or icons of the words.',
        `${filePrefix}-${i + 1}.png`
      )
    )
  );
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

  const url = String(task.payload?.url ?? '');

  try {
    if (!url) throw new Error('No URL provided for this business report');

    const [desktopShot, mobileShot, html, visuals] = await Promise.all([
      screenshotUrl(url, '1440x900', true),
      screenshotUrl(url, '390x844', true),
      fetchPageText(url),
      generateReportVisuals(taskId)
    ]);

    const content = await analyzeSite(url, desktopShot, mobileShot, html);

    const [flawImages, improvementImages, marketingImages] = await Promise.all([
      generateSlideVisuals(taskId, content.flaws, 'slide-flaw', 'website design/UX flaw'),
      generateSlideVisuals(taskId, content.improvements, 'slide-improvement', 'recommended website improvement'),
      generateSlideVisuals(taskId, content.marketingPlan, 'slide-marketing', 'social media marketing tactic')
    ]);
    const sections = toSections(content, visuals.dividers, {
      flaws: flawImages,
      improvements: improvementImages,
      marketing: marketingImages
    });

    const pdfBytes = await renderDocumentPdf({
      title: 'Business Report',
      subtitle: url,
      theme: 'deck',
      language: 'en',
      coverImageUrl: visuals.cover,
      sections
    });

    const { url: fileUrl } = await uploadDeliverable(taskId, 'business-report.pdf', pdfBytes, 'application/pdf');
    await addTaskFile(taskId, { url: fileUrl, fileType: 'application/pdf', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'business_report_generated', 'worker', { url: fileUrl, targetUrl: url });
    await markDelivered(taskId);

    const language = await getOwnerLanguage();
    if (task.owner_channel_id) {
      const chatId = Number(task.owner_channel_id);
      await sendBotMessage(chatId, `${task.public_id} business report for ${url} is ready.`, language).catch((err) =>
        console.error('worker-business-report: notify failed', err)
      );
      // The actual PDF, not just a link -- Telegram fetches the public
      // deliverables URL itself and attaches the real file to the chat.
      await sendTelegramDocument(chatId, fileUrl, `${task.public_id} — business report for ${url}`).catch((err) =>
        console.error('worker-business-report: sendTelegramDocument failed', err)
      );
    }

    return jsonResponse({ ok: true, url: fileUrl });
  } catch (err) {
    console.error(`worker-business-report failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Business report generation failed' });
  }
}

Deno.serve(handleRequest);
