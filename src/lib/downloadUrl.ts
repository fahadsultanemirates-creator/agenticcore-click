// Make a link actually save the file.
//
// The Deliverables card said "Download" and was a plain <a href target=
// "_blank">, so it opened the image in a tab and stopped there. Adding
// the `download` attribute would not have helped: the browser ignores it
// cross-origin, and every deliverable lives on the Supabase storage
// domain, not ours. On a phone that leaves a client looking at their logo
// with no way to keep it.
//
// Supabase storage takes a `download` query parameter and answers with
// Content-Disposition: attachment, which is a real download with a name
// we choose -- the stored name is a Telegram file id and nobody wants
// "1791395333770-photo-AgACAgEAAxkB....jpg" in their downloads folder.

const SUPABASE_PUBLIC_OBJECT = "/storage/v1/object/public/";

/** The extension from a URL's path, dot included, or "" if there is none. */
export function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * A URL that downloads rather than displays, or null when it cannot be
 * made into one.
 *
 * Null is not a failure to paper over: an owner-delivered link can point
 * anywhere, and a "Download" button that silently opens a tab is the bug
 * this module exists to fix. The caller labels the button from the answer.
 */
export function forcedDownloadUrl(url: string, filename: string): string | null {
  if (!url.includes(SUPABASE_PUBLIC_OBJECT)) return null;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}download=${encodeURIComponent(filename)}`;
}

/** "AC-1002-01-option-3.jpg" -- the order, the option, the real extension. */
export function deliverableFilename(publicId: string, optionIndex: number, url: string, totalOptions: number): string {
  const suffix = totalOptions > 1 ? `-option-${optionIndex}` : "";
  return `${publicId}${suffix}${extensionOf(url)}`;
}
