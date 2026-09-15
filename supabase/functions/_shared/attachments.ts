// Fetches client/owner-supplied reference files (logos, photos, product
// shots) from their public client-media URLs so a worker can hand the raw
// bytes to grokVisionChat. Capped in count and size -- reference material,
// not a bulk file transfer -- so a task with an oversized or excessive
// attachment list degrades to "ignore the rest" rather than blowing up a
// worker invocation.
const MAX_ATTACHMENTS = 5;
const MAX_BYTES_PER_FILE = 8 * 1024 * 1024;

export interface FetchedAttachment {
  bytes: Uint8Array;
  mimeType: string;
}

export async function fetchAttachments(urls: unknown): Promise<FetchedAttachment[]> {
  if (!Array.isArray(urls) || urls.length === 0) return [];

  const results: FetchedAttachment[] = [];
  for (const url of urls.slice(0, MAX_ATTACHMENTS)) {
    if (typeof url !== 'string' || !url) continue;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const mimeType = resp.headers.get('content-type') ?? 'application/octet-stream';
      if (!mimeType.startsWith('image/')) continue; // vision calls only accept images
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > MAX_BYTES_PER_FILE) continue;
      results.push({ bytes: new Uint8Array(buf), mimeType });
    } catch (err) {
      console.error(`fetchAttachments: could not fetch ${url}`, err);
    }
  }
  return results;
}
