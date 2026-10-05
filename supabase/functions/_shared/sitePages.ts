// Splitting one model response into the several HTML files a site is made of.
//
// Websites used to be a single index.html, so the worker asked for one
// fenced block and took it. They are sold by page count now -- 1-4 or
// 5-10 -- which means the model returns several documents in one reply and
// something has to tell them apart.
//
// The format is a FILE: line before each block, because it survives what
// models actually do: they reorder pages, they add prose between them, and
// they sometimes wrap the whole lot in another fence. A marker the parser
// looks for by name tolerates all three; relying on position does not.

export interface SitePage {
  /** The filename as deployed, e.g. "index.html" or "about.html". */
  name: string;
  html: string;
}

/** Everything after the first fence marker on a line, as a language tag. */
const BLOCK = /```[a-zA-Z]*\s*\n([\s\S]*?)```/g;

/**
 * A filename safe to serve.
 *
 * Model output is untrusted here in the ordinary sense -- not malicious,
 * but careless. A name with a slash or "../" in it would deploy outside
 * the site root, and one with a space breaks the links the other pages
 * use to reach it.
 */
export function safePageName(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["'`]|["'`]$/g, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) return null;
  if (trimmed.includes('..')) return null;
  const name = /\.html?$/i.test(trimmed) ? trimmed : `${trimmed}.html`;
  return name.length <= 64 ? name.toLowerCase() : null;
}

/**
 * The pages in a model reply.
 *
 * Falls back to a single index.html when there are no FILE: markers at
 * all, which keeps a one-page site -- a legitimate small-tier order --
 * working rather than failing on a format it had no reason to use.
 */
export function splitPages(reply: string): SitePage[] {
  const pages: SitePage[] = [];
  const seen = new Set<string>();

  // Walk the fenced blocks, and for each one look back at the text
  // immediately before it for a FILE: marker. Looking backwards rather
  // than parsing forwards means prose between the blocks cannot throw the
  // alignment off.
  let match: RegExpExecArray | null;
  BLOCK.lastIndex = 0;
  while ((match = BLOCK.exec(reply)) !== null) {
    const before = reply.slice(0, match.index);
    const marker = /FILE:\s*([^\s\n]+)[^\n]*\n[^`]*$/i.exec(before);
    const html = match[1].trim();
    if (!html) continue;

    const name = marker ? safePageName(marker[1]) : null;
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    pages.push({ name, html });
  }

  if (pages.length === 0) {
    // No markers: one document, the way it always was.
    BLOCK.lastIndex = 0;
    const only = BLOCK.exec(reply);
    const html = (only ? only[1] : reply).trim();
    return html ? [{ name: 'index.html', html }] : [];
  }

  // index.html first, because it is what the host serves at the root and
  // what every other page links back to.
  pages.sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : 0));

  // A site whose entry point is not index.html serves nothing at its own
  // address. If the model named its home page something else, the first
  // page becomes index.html rather than the order failing.
  if (!pages.some((p) => p.name === 'index.html')) {
    pages[0] = { ...pages[0], name: 'index.html' };
  }

  return pages;
}
