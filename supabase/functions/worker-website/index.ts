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
import { extractCodeBlock } from '../_shared/grok.ts';
import { claudeChat, claudeVisionChat } from '../_shared/claude.ts';
import { fetchAttachments } from '../_shared/attachments.ts';
import { generateBrandVisual, mapWithConcurrency } from '../_shared/images.ts';
import { buildZip } from '../_shared/zip.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const NETLIFY_AUTH_TOKEN = Deno.env.get('NETLIFY_AUTH_TOKEN')!;
const NETLIFY_API = 'https://api.netlify.com/api/v1';

// The large tier (4-10 sections) gets more real photography than the small
// one (2-4 sections) -- both are still a single self-contained HTML page,
// just with more sections/imagery to fill out.
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

function buildPrompt(payload: Record<string, unknown>, images: { label: string; url: string }[]): { system: string; user: string } {
  const system = [
    'You are a senior front-end developer generating a complete, production-quality single-page',
    'business website as ONE self-contained HTML file (inline <style> and <script>, no external',
    'dependencies except Google Fonts if you want). Requirements:',
    '- Semantic HTML5, fully responsive (mobile-first), modern clean design, thoughtful visual hierarchy and spacing.',
    '- Include every section and contact/social link the brief provides; omit ones left blank.',
    '- No placeholder lorem ipsum -- write real, on-brand copy from the brief.',
    '- Contact details/socials become real clickable links/buttons (mailto:, tel:, wa.me, etc).',
    '- You are given real generated image URLs below -- use each one\'s exact URL in an <img src="..."> ' +
      'in the section it describes. Never invent, alter, or fall back to a placeholder/stock image URL.',
    '- Respond with ONLY one ```html fenced code block containing the full document.'
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

async function deployToNetlify(siteId: string, html: string): Promise<void> {
  const zip = buildZip([{ name: 'index.html', data: new TextEncoder().encode(html) }]);
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
    const userWithBrand = user + brandFactsForPrompt(profile);

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
    const html = extractCodeBlock(raw, 'html');

    const { siteId, url } = await ensureNetlifySite(taskId, task.public_id, task.brand ?? {});
    await deployToNetlify(siteId, html);

    await supabaseAdmin.from('tasks').update({ preview_url: url }).eq('id', taskId);
    await addTaskFile(taskId, { url, fileType: 'website', optionIndex: 1, version: task.version });
    await logEvent(taskId, 'website_deployed', 'worker', { url });
    await markDelivered(taskId);

    return jsonResponse({ ok: true, url });
  } catch (err) {
    console.error(`worker-website failed for ${taskId}:`, err);
    await markFailed(taskId, err instanceof Error ? err.message : String(err));
    return jsonResponse({ ok: false, error: 'Website generation failed' });
  }
}

Deno.serve(handleRequest);
