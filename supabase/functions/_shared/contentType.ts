// Saying which alphabet the bytes are written in.
//
// A caption pack came back with â€" where every em-dash should be, â€œ for
// every opening quote, â€¢ for every bullet. The bytes were correct UTF-8
// the whole way through -- the agent wrote them properly, storage kept them
// properly. What was missing was the label: we served them as `text/plain`
// with no charset, so the browser fell back to Latin-1 and rendered each
// multi-byte character as the two or three separate characters its bytes
// happen to spell.
//
// Only text formats need this. A PDF or a PNG carries its own encoding
// internally and a charset on them is meaningless noise.

const NEEDS_CHARSET = /^text\/|^application\/(json|xml|javascript|csv)$/i;

/**
 * The content type to actually serve, with a charset where one belongs.
 *
 * Idempotent: a type that already declares a charset is returned untouched,
 * whatever that charset is -- if a caller deliberately said windows-1252,
 * overriding it would corrupt their file rather than fix it.
 */
export function servableContentType(contentType: string | null | undefined): string {
  const declared = (contentType ?? '').trim();
  if (!declared) return 'application/octet-stream';
  if (/;\s*charset=/i.test(declared)) return declared;
  return NEEDS_CHARSET.test(declared.split(';')[0].trim()) ? `${declared}; charset=utf-8` : declared;
}
