// Parsing a client's website for the facts it states about itself.
//
// Split out from brandProfile.ts so it can be tested directly: that module
// reaches for the Claude and screenshot APIs at import time, and this is pure
// string work over whatever HTML a site happens to serve. The failure mode is
// a wrong fact printed on finished work -- an invented address on a letterhead
// is worse than no address at all -- so it is worth testing properly.

import type { BrandProfile } from './brandProfile.ts';

function absolute(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

// Business sites publish their real contact details as schema.org markup --
// an Organization or LocalBusiness block in <script type="application/ld+json">.
// That is worth parsing properly, because the alternative for an address is
// guessing at free text with a regex, which reliably picks up something that
// is not an address.
interface ScrapedContact {
  phone?: string;
  email?: string;
  address?: string;
}

function formatPostalAddress(node: any): string | undefined {
  if (typeof node === 'string') return node.trim() || undefined;
  if (!node || typeof node !== 'object') return undefined;
  const parts = [
    node.streetAddress,
    node.addressLocality,
    node.addressRegion,
    node.postalCode,
    node.addressCountry?.name ?? node.addressCountry
  ]
    .map((part: unknown) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part: string) => part !== '');
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function contactFromJsonLd(html: string): ScrapedContact {
  const found: ScrapedContact = {};

  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue; // One malformed block must not lose the others.
    }

    // A page may carry several blocks, an @graph, or a bare array.
    const queue: any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node['@graph'])) queue.push(...node['@graph']);

      if (!found.phone && typeof node.telephone === 'string') found.phone = node.telephone.trim();
      if (!found.email && typeof node.email === 'string') found.email = node.email.replace(/^mailto:/i, '').trim();
      if (!found.address) {
        const address = formatPostalAddress(node.address);
        if (address) found.address = address;
      }
    }
  }

  return found;
}

// The <address> element, when a site uses it as intended. Tags stripped and
// whitespace collapsed, since it is usually laid out across several lines.
function addressFromTag(html: string): string | undefined {
  const inner = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i)?.[1];
  if (!inner) return undefined;
  const text = inner
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s*,\s*(?=,)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(^[\s,]+|[\s,]+$)/g, '')
    .trim();
  return text.length >= 8 && text.length <= 200 ? text : undefined;
}

// Exact facts, parsed rather than guessed.
export function scrapeHtml(html: string, baseUrl: string): Partial<BrandProfile> {
  const pick = (re: RegExp): string | undefined => html.match(re)?.[1]?.trim();

  const logoCandidate =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
    pick(/<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i) ??
    pick(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);

  const socials: Record<string, string> = {};
  const socialHosts: [string, RegExp][] = [
    ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.\-\/]+/i],
    ['facebook', /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.\-\/]+/i],
    ['linkedin', /https?:\/\/(?:www\.)?linkedin\.com\/[A-Za-z0-9_.\-\/]+/i],
    ['x', /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_.\-\/]+/i],
    ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/[@A-Za-z0-9_.\-\/]+/i],
    ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/[A-Za-z0-9_.\-\/@]+/i],
    ['whatsapp', /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^\s"'<>]+/i]
  ];
  for (const [name, re] of socialHosts) {
    const found = html.match(re)?.[0];
    if (found) socials[name] = found;
  }

  // Structured markup first -- it is stated by the site rather than inferred.
  const structured = contactFromJsonLd(html);
  const email = structured.email ?? html.match(/mailto:([^\s"'<>?]+@[^\s"'<>?]+)/i)?.[1];
  const phone = structured.phone ?? html.match(/tel:([+0-9()\-\s]{6,})/i)?.[1]?.trim();
  const address = structured.address ?? addressFromTag(html);

  return {
    businessName:
      pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<title[^>]*>([^<]+)<\/title>/i),
    description:
      pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i),
    logoUrl: logoCandidate ? absolute(logoCandidate, baseUrl) : undefined,
    socials: Object.keys(socials).length > 0 ? socials : undefined,
    // A site that publishes none of these simply has none -- the deliverable
    // then carries what it does have, rather than a blank labelled field.
    contact:
      email || phone || address || socials.whatsapp
        ? { email, phone, address, whatsapp: socials.whatsapp }
        : undefined
  };
}


// wa.me/18089985226 is a link, not a phone number. On a printed letterhead a
// link is useless -- nobody types a tracking URL off paper -- so the digits
// are pulled out and presented as something dialable. Spacing is deliberately
// not guessed: grouping differs by country and a wrongly-spaced number reads
// as an error on finished work.
export function whatsappNumber(link: string | undefined): string | undefined {
  if (!link) return undefined;
  const digits = link.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{7,15})/i)?.[1];
  return digits ? `+${digits}` : undefined;
}
