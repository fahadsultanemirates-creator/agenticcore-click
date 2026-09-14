// Owner-only: given a URL, screenshots it (desktop + mobile) so Grok can
// actually see the site rather than just reason about raw markup, then
// produces a three-part deck -- flaws, improvements, social marketing
// plan -- rendered as a .click-branded PDF (dark theme, big mobile-legible
// type, one topic per page). Invoked by the dispatcher with { taskId }.

import { supabaseAdmin, uploadDeliverable } from '../_shared/storage.ts';
import { grokVisionChat } from '../_shared/grok.ts';
import { screenshotUrl } from '../_shared/htmlPdf.ts';
import { renderDocumentPdf, type DocSection } from '../_shared/pdf.ts';
import { sendBotMessage, getOwnerLanguage } from '../_shared/botMessage.ts';
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
      'professional language -- no code, no HTML, no symbols like # @ * / no markdown). Aim for 3-7 slides per ' +
      'part, 10-20 total. Respond with ONLY JSON: ' +
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

function toSections(content: ReportContent): DocSection[] {
  const divider = (title: string): DocSection => ({ heading: title, body: '' });
  return [
    divider('Part 1 — Website & Theme Flaws'),
    ...content.flaws,
    divider('Part 2 — Recommended Improvements'),
    ...content.improvements,
    divider('Part 3 — Social Media Marketing Plan'),
    ...content.marketingPlan
  ];
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

    const [desktopShot, mobileShot, html] = await Promise.all([
      screenshotUrl(url, '1440x900', true),
      screenshotUrl(url, '390x844', true),
      fetchPageText(url)
    ]);

    const content = await analyzeSite(url, desktopShot, mobileShot, html);
    const sections = toSections(content);

    const pdfBytes = await renderDocumentPdf({
      title: 'Business Report',
      subtitle: url,
      theme: 'deck',
      language: 'en',
      sections
    });

    const { url: fileUrl } = await uploadDeliverable(taskId, 'business-report.pdf', pdfBytes, 'application/pdf');
    await addTaskFile(taskId, { url: fileUrl, fileType: 'application/pdf', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'business_report_generated', 'worker', { url: fileUrl, targetUrl: url });
    await markDelivered(taskId);

    const language = await getOwnerLanguage();
    if (task.owner_channel_id) {
      await sendBotMessage(
        Number(task.owner_channel_id),
        `${task.public_id} business report for ${url} is ready: ${fileUrl}`,
        language
      ).catch((err) => console.error('worker-business-report: notify failed', err));
    }

    return jsonResponse({ ok: true, url: fileUrl });
  } catch (err) {
    console.error(`worker-business-report failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Business report generation failed' });
  }
}

Deno.serve(handleRequest);
