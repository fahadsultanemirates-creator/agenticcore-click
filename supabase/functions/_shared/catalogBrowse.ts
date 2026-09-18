// Paging a catalog you browse from a phone.
//
// Pure on purpose, following the same split as orderMatch.ts: the logic that
// decides WHICH options to show is testable without Telegram, HeyGen or a
// database in the room, and the function file keeps only the sending.
//
// The rules here are small but each one comes from a way a person actually
// types. "/avatars female 3" and "/avatars 3 female" mean the same thing.
// "/avatars 99" on a two-page list should show the last page, not an empty
// one -- an out-of-range page is a typo, not a request for nothing.

/** Five previews is what fits on a phone screen without scrolling past what you are comparing. */
export const CATALOG_PAGE_SIZE = 5;

export interface CatalogPage {
  /** 1-based, clamped into range. */
  page: number;
  pages: number;
  /** Slice bounds into the filtered list. */
  from: number;
  to: number;
}

export function paginate(total: number, requested: number, size = CATALOG_PAGE_SIZE): CatalogPage {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requested), pages);
  const from = (page - 1) * size;
  return { page, pages, from, to: Math.min(from + size, total) };
}

/** Splits "female 3" into a filter word and a page number, in either order. */
export function parseBrowseArgs(raw: string | undefined): { filter?: string; page: number } {
  const tokens = (raw ?? '').trim().split(/\s+/).filter(Boolean);
  let page = 1;
  const words: string[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) page = Number(token);
    else words.push(token);
  }
  return { filter: words.join(' ') || undefined, page };
}

/** The line under a page of previews: where you are, and how to go on. */
export function browseFooter(
  command: 'avatars' | 'voices',
  filter: string | undefined,
  p: CatalogPage,
  total: number
): string {
  const scope = filter ? ` matching "${filter}"` : '';
  const next = p.page < p.pages ? `\n\nNext: /${command} ${filter ? filter + ' ' : ''}${p.page + 1}` : '';
  return `Showing ${p.from + 1}-${p.to} of ${total}${scope} (page ${p.page} of ${p.pages}).${next}`;
}
