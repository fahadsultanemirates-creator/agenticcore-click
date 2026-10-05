// Generates a single-page site via Claude (real, production-quality HTML/CSS/JS
// -- this is squarely Claude's strength, matching or beating what a senior
// front-end dev would hand-write), then deploys it live on Netlify (a new
// site per task, or redeploying the existing one on a revision). A handful
// of real Grok-generated content images (hero/about/services/gallery) are
// generated first and handed to Claude as exact URLs to embed -- never
// left to invent placeholder image sources. Invoked by the dispatcher with
// { taskId }; never called directly by the client.

import { supabaseAdmin } from '../_shared/storage.ts';
import { getBrandProfile, brandFactsForPrompt, brandStyleForPrompt, extractUrl, normalizeUrl } from '../_shared/brandProfile.ts';
import { claudeChat, claudeVisionChat } from '../_shared/claude.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { generateBrandVisual, mapWithConcurrency } from '../_shared/images.ts';
import { buildZip } from '../_shared/zip.ts';
import { splitPages, type SitePage } from '../_shared/sitePages.ts';
import { WEBSITE_LARGE_PAGES, WEBSITE_SMALL_PAGES } from '../_shared/pricing.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';
import { requireInternalCaller } from '../_shared/internal.ts';

const NETLIFY_AUTH_TOKEN = Deno.env.get('NETLIFY_AUTH_TOKEN')!;
const NETLIFY_API = 'https://api.netlify.com/api/v1';

// Sites are sold by PAGE COUNT: 1-4 pages small, 5-10 large. They were
// one index.html with more or fewer sections, which meant a client who
// asked for five pages got one long scroll -- the right word on the
// invoice and the wrong thing in the zip. The large tier also gets more
// real photography than the small one.
const IMAGE_SLOTS_SMALL = [
  { label: 'hero/banner image for the top of the page', filename: 'hero.png' },
  { label: 'about/ambience image (interior, team, or workspace feel)', filename: 'about.png' },
  { label: 'product/service showcase image', filename: 'services.png' }
];
const IMAGE_SLOTS_LARGE = [
  ...IMAGE_SLOTS_SMALL,
  { label: 'secondary hero/promo image for a feature or CTA section', filename: 'promo.png' },
  { label: 'gallery image #1 (a different product/service angle)', filename: 'gallery-1.png' },
  { label: 'gallery image #2 (a different product/service angle)', filename: 'gallery-2.png' }
];


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

function imageSlotsForPayload(payload: Record<string, unknown>): { label: string; filename: string }[] {
  return String(payload.tier ?? '').toLowerCase() === 'large' ? IMAGE_SLOTS_LARGE : IMAGE_SLOTS_SMALL;
}

async function generateWebsiteImages(
  taskId: string,
  payload: Record<string, unknown>,
  brandStyle: string
): Promise<{ label: string; url: string }[]> {
  const slots = imageSlotsForPayload(payload);
  // The structured fields come from the website intake form; an owner task
  // (Telegram /new) carries only payload.brief, which would leave this
  // context blank and generate photos with nothing to go on -- the page
  // copy itself is unaffected, since buildPrompt dumps every payload field
  // including the brief.
  const businessContext =
    [payload.businessName, payload.category, payload.description ?? payload.brief]
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
      .join(' -- ');

  const urls = await mapWithConcurrency(slots, 4, (slot) =>
    generateBrandVisual(
      taskId,
      `A real, on-brand photograph/illustration for a business website. Business: ${businessContext}. ` +
        `This specific image is the: ${slot.label}. High-quality, professional, matches the business's category.` +
        brandStyle,
      slot.filename
    )
  );

  return slots.map((slot, i) => ({ label: slot.label, url: urls[i] }));
}

/**
 * How many pages this order bought.
 *
 * The tier is the contract -- it is what was priced and charged -- so the
 * count is clamped into its range rather than taken from the brief alone.
 * A client who pays for the small tier and writes "make it 9 pages" gets
 * four, which is what they bought, instead of the worker quietly
 * delivering the larger product for the smaller price.
 */
function pageCountFor(payload: Record<string, unknown>): { count: number; min: number; max: number } {
  const large = payload.tier === 'large';
  const min = large ? WEBSITE_LARGE_PAGES.min : WEBSITE_SMALL_PAGES.min;
  const max = large ? WEBSITE_LARGE_PAGES.max : WEBSITE_SMALL_PAGES.max;
  const asked = Number(payload.pageCount ?? payload.pages ?? payload.sections);
  const count = Number.isFinite(asked) && asked > 0 ? Math.min(max, Math.max(min, Math.round(asked))) : large ? 5 : 3;
  return { count, min, max };
}

function buildPrompt(payload: Record<string, unknown>, images: { label: string; url: string }[]): { system: string; user: string } {
  const { count } = pageCountFor(payload);
  const system = [
    `You are a senior front-end developer generating a complete, production-quality business`,
    `website of EXACTLY ${count} page${count === 1 ? '' : 's'}. Each page is its own self-contained`,
    'HTML file (inline <style> and <script>, no external dependencies except Google Fonts if you',
    'want). Requirements:',
    `- Produce exactly ${count} page${count === 1 ? '' : 's'}. One of them MUST be named index.html and is the home page.`,
    '- Before each page, on its own line, write: FILE: <filename>.html',
    '- Then the page itself in a ```html fenced block. One block per page.',
    '- Every page carries the SAME header and nav, and the nav links to every other page by its ' +
      'exact filename (href="about.html"), so the site actually navigates. A nav link that goes ' +
      'nowhere is the one thing a visitor notices immediately.',
    '- Every page shares the same styling, so they read as one site rather than several.',
    '- Semantic HTML5, fully responsive (mobile-first), modern clean design, thoughtful visual hierarchy and spacing.',
    '- Include every section and contact/social link the brief provides; omit ones left blank.',
    '- No placeholder lorem ipsum -- write real, on-brand copy from the brief.',
    '- Contact details/socials become real clickable links/buttons (mailto:, tel:, wa.me, etc).',
    '- You are given real generated image URLs below -- use each one\'s exact URL in an <img src="..."> ' +
      'in the section it describes. Never invent, alter, or fall back to a placeholder/stock image URL.',
    '- No commentary outside the FILE: lines and the fenced blocks.'
  ].join('\n');

  const lines = Object.entries(payload)
    .filter(([k, v]) => k !== 'referenceFiles' && v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);

  const imageLines = images.map((img, i) => `${i + 1}. ${img.label}: ${img.url}`);

  const user =
    `Build the website for this business:\n\n${lines.join('\n')}\n\n` +
    `Available real images (use these exact URLs, one <img> per image):\n${imageLines.join('\n')}`;
  return { system, user };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

async function ensureNetlifySite(taskId: string, publicId: string, brand: Record<string, unknown>): Promise<{ siteId: string; url: string }> {
  const existingId = brand.netlify_site_id as string | undefined;
  if (existingId) {
    const resp = await fetch(`${NETLIFY_API}/sites/${existingId}`, {
      headers: { Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}` }
    });
    if (resp.ok) {
      const site = await resp.json();
      return { siteId: site.id, url: site.ssl_url || site.url };
    }
    // Fall through to create a fresh one if the stored site vanished.
  }

  const name = `ac-click-${slugify(publicId)}-${crypto.randomUUID().slice(0, 6)}`;
  const createResp = await fetch(`${NETLIFY_API}/sites`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!createResp.ok) {
    throw new Error(`Netlify site creation failed (${createResp.status}): ${await createResp.text()}`);
  }
  const site = await createResp.json();

  await supabaseAdmin
    .from('tasks')
    .update({ brand: { ...brand, netlify_site_id: site.id } })
    .eq('id', taskId);

  // Known gap: sites created via this API have come back with Netlify's
  // "require team login" visitor access control ON by default on this
  // account/plan (existing sites created through the dashboard did not),
  // which would 401 every real visitor. There's no confirmed public API
  // call from here to turn it off, so it's flagged loudly instead of
  // silently shipping an inaccessible site -- fix per-site via the
  // Netlify dashboard (or MCP) until Netlify's default changes.
  await supabaseAdmin.from('task_events').insert({
    task_id: taskId,
    event_type: 'netlify_site_created_check_access',
    actor: 'worker',
    detail: { siteId: site.id, note: 'Verify visitor access control is not set to require team login before sharing this URL.' }
  });

  return { siteId: site.id, url: site.ssl_url || site.url };
}

async function deployToNetlify(siteId: string, pages: SitePage[]): Promise<void> {
  const zip = buildZip(pages.map((page) => ({ name: page.name, data: new TextEncoder().encode(page.html) })));
  const resp = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}`, 'Content-Type': 'application/zip' },
    body: zip
  });
  if (!resp.ok) {
    throw new Error(`Netlify deploy failed (${resp.status}): ${await resp.text()}`);
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  // Dispatcher only. verify_jwt accepts the anon key from the browser
  // bundle, so this is the check that actually keeps the door shut.
  const denied = requireInternalCaller(req);
  if (denied) return denied;

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
    const profile = await getBrandProfile(brandUrlFor(payload));
    const [images, attachments] = await Promise.all([
      generateWebsiteImages(taskId, payload, brandStyleForPrompt(profile)),
      fetchAttachments(payload.referenceFiles)
    ]);
    const { system, user } = buildPrompt(payload, images);
    const userWithBrand = user + brandFactsForPrompt(profile) + revisionInstruction(payload);

    const raw = attachments.length > 0
      ? await claudeVisionChat(
          `${system}\nYou are also given reference image(s) (a logo and/or business photos) -- visually match their colors, style, and branding in the site you build.`,
          userWithBrand,
          attachments,
          { maxTokens: 16000 }
        )
      : await claudeChat([
          { role: 'system', content: system },
          { role: 'user', content: userWithBrand }
        ], { maxTokens: 16000 });
    const pages = splitPages(raw);
    if (pages.length === 0) {
      throw new Error('The generator returned no usable HTML');
    }

    const { count } = pageCountFor(payload);
    if (pages.length !== count) {
      // Not fatal -- a site with four good pages instead of five is worth
      // delivering -- but it is the difference between what was sold and
      // what arrived, so it is recorded rather than noticed later by a
      // client counting the nav.
      console.warn(`worker-website: ${task.public_id} asked for ${count} pages, got ${pages.length}`);
      await logEvent(taskId, 'website_page_count_mismatch', 'worker', {
        asked: count,
        got: pages.length,
        pages: pages.map((p) => p.name)
      });
    }

    const { siteId, url } = await ensureNetlifySite(taskId, task.public_id, task.brand ?? {});
    await deployToNetlify(siteId, pages);

    await supabaseAdmin.from('tasks').update({ preview_url: url }).eq('id', taskId);
    await addTaskFile(taskId, { url, fileType: 'website', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'website_deployed', 'worker', { url, pages: pages.map((p) => p.name) });
    await markDelivered(taskId);

    return jsonResponse({ ok: true, url });
  } catch (err) {
    console.error(`worker-website failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Website generation failed' });
  }
}

Deno.serve(handleRequest);
