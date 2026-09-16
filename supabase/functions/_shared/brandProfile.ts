// Turns a client's existing website into their brand, once, and reuses it
// across every product they order.
//
// This is the engine behind "you didn't get your website from us? send us the
// URL and we'll match it". Before this, a URL bought you two hex colours on a
// brand-kit item and nothing at all on the other six services, while the PDF
// page advertised "auto-pulls logo, colors, copy & socials".
//
// The split of labour is deliberate. Anything a parser can read exactly --
// the logo file, social links, email, phone -- is read from the HTML, because
// a model asked for a URL will happily invent a plausible one. Only the
// judgement calls -- which colours actually carry the brand, what the writing
// sounds like, what the business does -- go to a vision call, which sees the
// rendered page rather than the markup.

import { claudeVisionChat } from './claude.ts';
import { scrapeHtml, whatsappNumber } from './brandScrape.ts';

// Parsing lives in brandScrape.ts (pure, and tested); re-exported here because
// this is where callers already look for it.
export { scrapeHtml } from './brandScrape.ts';
import { screenshotUrl } from './htmlPdf.ts';
import { supabaseAdmin } from './storage.ts';

const STALE_AFTER_DAYS = 30;

export interface BrandProfile {
  url: string;
  businessName?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  /** The brand's own colours -- never agenticcore's. */
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  /** Described, not named: "geometric sans, tight tracking, heavy headings". */
  fontStyle?: string;
  /** Described so an image model can match it, since we can't reuse the file. */
  visualStyle?: string;
  tone?: string;
  services?: string[];
  logoUrl?: string;
  socials?: Record<string, string>;
  contact?: { email?: string; phone?: string; whatsapp?: string; address?: string };
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

// Finds a URL inside free text, so a client who just types "make me a
// letterhead for mybakery.com" gets their branding without a separate field.
export function extractUrl(text: string): string | null {
  const httpMatch = text.match(/https?:\/\/[^\s)<>"']+/i);
  if (httpMatch) return normalizeUrl(httpMatch[0]);
  const bareMatch = text.match(
    /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|ai|app|shop|store|agency|click|biz|info|me|pk|ae|uk)\b/i
  );
  return bareMatch ? normalizeUrl(bareMatch[0]) : null;
}


const HEX = /^#[0-9a-f]{6}$/i;

async function extractProfile(url: string): Promise<BrandProfile> {
  const [shot, html] = await Promise.all([
    screenshotUrl(url, '1440x900', false),
    fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgenticCoreBrandBot/1.0)' } })
      .then((r) => r.text())
      .catch(() => '')
  ]);

  const scraped = scrapeHtml(html, url);

  const raw = await claudeVisionChat(
    'You are a brand analyst. From this screenshot of a business website, identify the brand so another ' +
      'designer could produce on-brand material without seeing the site. Report ONLY what is actually visible -- ' +
      'never invent a colour, a service, or a name that is not there; omit a field instead. Respond with ONLY ' +
      'JSON of this exact shape: {"businessName": string|null, "tagline": string|null, "industry": string|null, ' +
      '"primaryColor": "#rrggbb"|null, "accentColor": "#rrggbb"|null, "backgroundColor": "#rrggbb"|null, ' +
      '"textColor": "#rrggbb"|null, "fontStyle": string|null, "visualStyle": string|null, "tone": string|null, ' +
      '"services": string[]|null}. fontStyle and visualStyle are short descriptions a designer could work from. ' +
      'tone describes how the copy reads. No markdown fences, no commentary.',
    `Website: ${url}\n\nPage text for reference (truncated):\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)}`,
    [{ bytes: shot, mimeType: 'image/png' }],
    { maxTokens: 1500 }
  );

  const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
  const seen = JSON.parse(cleaned);

  const colour = (value: unknown): string | undefined =>
    typeof value === 'string' && HEX.test(value) ? value : undefined;
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  return {
    url,
    // Parsed HTML wins for anything factual; the model fills the rest.
    businessName: text(scraped.businessName) ?? text(seen.businessName),
    tagline: text(seen.tagline),
    description: text(scraped.description),
    industry: text(seen.industry),
    primaryColor: colour(seen.primaryColor),
    accentColor: colour(seen.accentColor),
    backgroundColor: colour(seen.backgroundColor),
    textColor: colour(seen.textColor),
    fontStyle: text(seen.fontStyle),
    visualStyle: text(seen.visualStyle),
    tone: text(seen.tone),
    services: Array.isArray(seen.services) ? seen.services.filter((s: unknown) => typeof s === 'string').slice(0, 12) : undefined,
    logoUrl: scraped.logoUrl,
    socials: scraped.socials,
    contact: scraped.contact
  };
}

// Never throws: a client's unreachable or odd site means we build without
// their branding, which is a worse deliverable but not a failed task.
export async function getBrandProfile(rawUrl: string | null | undefined): Promise<BrandProfile | null> {
  if (!rawUrl) return null;
  const url = normalizeUrl(String(rawUrl));
  if (!url) return null;

  try {
    const { data: cached } = await supabaseAdmin
      .from('brand_profiles')
      .select('profile, fetched_at')
      .eq('url', url)
      .maybeSingle();

    if (cached?.profile) {
      const ageDays = (Date.now() - new Date(cached.fetched_at).getTime()) / 86_400_000;
      if (ageDays < STALE_AFTER_DAYS) return cached.profile as BrandProfile;
    }

    const profile = await extractProfile(url);
    await supabaseAdmin
      .from('brand_profiles')
      .upsert({ url, profile, fetched_at: new Date().toISOString() }, { onConflict: 'url' });
    return profile;
  } catch (err) {
    console.error(`getBrandProfile failed for ${url}`, err);
    return null;
  }
}

// Renders the profile for a *content* prompt. Deliberately excludes colours
// and fonts: a generator told about colours writes about colours, which is
// how design annotations like "(navy header band)" ended up printed as body
// text on a letterhead. Design values are applied by the renderer, not
// described by the writer.
export function brandFactsForPrompt(profile: BrandProfile | null): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.businessName) lines.push(`Business name: ${profile.businessName}`);
  if (profile.tagline) lines.push(`Tagline: ${profile.tagline}`);
  if (profile.description) lines.push(`What they do: ${profile.description}`);
  if (profile.industry) lines.push(`Industry: ${profile.industry}`);
  if (profile.services?.length) lines.push(`Services: ${profile.services.join(', ')}`);
  if (profile.tone) lines.push(`Their tone of voice (match it): ${profile.tone}`);
  if (profile.contact?.email) lines.push(`Email: ${profile.contact.email}`);
  if (profile.contact?.phone) lines.push(`Phone: ${profile.contact.phone}`);
  // As a number, not a wa.me link -- see whatsappNumber.
  const whatsapp = whatsappNumber(profile.contact?.whatsapp ?? profile.socials?.whatsapp);
  if (whatsapp) lines.push(`WhatsApp: ${whatsapp}`);
  if (profile.contact?.address) lines.push(`Address: ${profile.contact.address}`);
  if (profile.socials) {
    for (const [name, link] of Object.entries(profile.socials)) {
      if (name === 'whatsapp') continue; // already emitted as a dialable number
      lines.push(`${name}: ${link}`);
    }
  }
  if (!lines.length) return '';
  return (
    "\n\nThe client's real details, taken from their own website -- use these exact facts rather than " +
    `inventing any, and never contradict them:\n${lines.join('\n')}`
  );
}

// Renders the profile for an *image* prompt, where visual language is exactly
// what's wanted -- the opposite of brandFactsForPrompt.
export function brandStyleForPrompt(profile: BrandProfile | null): string {
  if (!profile) return '';
  const bits: string[] = [];
  if (profile.primaryColor) bits.push(`primary colour ${profile.primaryColor}`);
  if (profile.accentColor) bits.push(`accent colour ${profile.accentColor}`);
  if (profile.visualStyle) bits.push(profile.visualStyle);
  if (profile.fontStyle) bits.push(`typography feel: ${profile.fontStyle}`);
  if (!bits.length) return '';
  return ` Match this brand's existing look: ${bits.join('; ')}.`;
}

// The client's logo, fetched and inlined as a data URI.
//
// The profile has carried logoUrl since it was written, but nothing ever
// fetched it, so every "on-brand" deliverable came back logo-less. Inlined
// rather than referenced because the renderer is a third-party HTML-to-PDF
// service: a plain <img src="https://theirsite/logo.png"> depends on that
// service being allowed to hotlink, and when it isn't, the failure is a
// silently broken image on a finished deliverable.
//
// Returns undefined rather than throwing. A missing logo makes a letterhead
// plainer; a failed render makes it nothing at all.
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_TIMEOUT_MS = 8000;

export async function fetchLogoDataUri(profile: BrandProfile | null): Promise<string | undefined> {
  const url = profile?.logoUrl;
  if (!url) return undefined;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) });
    if (!resp.ok) return undefined;

    const contentType = (resp.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) return undefined;

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return undefined;

    // btoa needs a binary string; chunked so a large logo can't blow the
    // argument limit on String.fromCharCode.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch (err) {
    console.error('fetchLogoDataUri failed', url, err);
    return undefined;
  }
}
