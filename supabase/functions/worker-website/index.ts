// Generates a single-page site via Grok, then deploys it live on Netlify
// (a new site per task, or redeploying the existing one on a revision).
// Invoked by the dispatcher with { taskId }; never called directly by the
// client.

import { supabaseAdmin } from '../_shared/storage.ts';
import { grokChat, extractCodeBlock } from '../_shared/grok.ts';
import { buildZip } from '../_shared/zip.ts';
import { addTaskFile, logEvent, markDelivered, markFailed } from '../_shared/task.ts';
import { jsonResponse } from '../_shared/cors.ts';

const NETLIFY_AUTH_TOKEN = Deno.env.get('NETLIFY_AUTH_TOKEN')!;
const NETLIFY_API = 'https://api.netlify.com/api/v1';

function buildPrompt(payload: Record<string, unknown>): { system: string; user: string } {
  const system = [
    'You are a senior front-end developer generating a complete, production-quality single-page',
    'business website as ONE self-contained HTML file (inline <style> and <script>, no external',
    'dependencies except Google Fonts if you want). Requirements:',
    '- Semantic HTML5, fully responsive (mobile-first), modern clean design.',
    '- Include every section and contact/social link the brief provides; omit ones left blank.',
    '- No placeholder lorem ipsum -- write real, on-brand copy from the brief.',
    '- Contact details/socials become real clickable links/buttons (mailto:, tel:, wa.me, etc).',
    '- Respond with ONLY one ```html fenced code block containing the full document.'
  ].join('\n');

  const lines = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);

  const user = `Build the website for this business:\n\n${lines.join('\n')}`;
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
    const { system, user } = buildPrompt(task.payload ?? {});
    const raw = await grokChat([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ], { maxTokens: 8000 });
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
