// Which Telegram method sends a given deliverable.
//
// A logo should appear in the chat as a picture, not as a file you have
// to tap to see. A PDF should arrive as a document you can keep. A video
// should play. Telegram has a different endpoint for each, and picking
// the wrong one is the difference between a client seeing their logo and
// a client seeing a grey box called "file".
//
// Pure, so every mapping can be checked without sending anything.

export type SendKind = 'photo' | 'video' | 'audio' | 'document';

const PHOTO = new Set(['jpg', 'jpeg', 'png', 'webp']);
const VIDEO = new Set(['mp4', 'mov', 'webm']);
const AUDIO = new Set(['mp3', 'm4a', 'ogg', 'oga', 'wav']);

/**
 * The extension at the end of a URL, lower-cased.
 *
 * Query strings and fragments are stripped first: a signed storage URL
 * ends in "?token=..." and reading the extension off the whole string
 * would find "png?token=abc" and match nothing.
 */
export function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot === -1 ? '' : last.slice(dot + 1).toLowerCase();
}

/**
 * How to send this file.
 *
 * The recorded MIME type wins when there is one -- it is what the
 * uploader actually saw. The extension is the fallback, because a file
 * delivered by hand through the bot is recorded as "manual" with no
 * usable type, and a GIF from a URL is still a GIF.
 *
 * Anything unrecognised goes as a document: wrong but harmless, where
 * guessing "photo" on a 40MB zip is a failed send and a client who gets
 * nothing.
 */
export function sendKindFor(opts: { fileType?: string | null; url: string }): SendKind {
  const mime = (opts.fileType ?? '').toLowerCase();
  if (mime.startsWith('image/') && !mime.includes('svg')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  // 'manual', 'application/pdf', '' and anything else fall through to the
  // extension, which is all a hand-delivered file leaves us.
  if (mime === '' || mime === 'manual' || !mime.includes('/')) {
    const ext = extensionOf(opts.url);
    if (PHOTO.has(ext)) return 'photo';
    if (VIDEO.has(ext)) return 'video';
    if (AUDIO.has(ext)) return 'audio';
  }
  return 'document';
}

/**
 * How many files to push into a chat for one order.
 *
 * An image product returns five options, which is five pictures and
 * exactly what the client wants to see. Beyond that it is a flood, and
 * the rest are in the dashboard.
 */
export const MAX_FILES_TO_CHAT = 6;

/**
 * The line that goes out with a finished order.
 *
 * Pure because of where it points. A client who signed up in Telegram has
 * no website password -- only the one-time code -- so "saved to your
 * dashboard" sent them to a login screen their code does not open, which
 * is exactly how the first real order ended. The link has to follow the
 * account, not the product.
 */
export function deliveryHeader(opts: {
  productName: string;
  publicId: string;
  fileCount: number;
  /** True when this client has still not set a website password. */
  needsClaim: boolean;
}): string {
  const lines = [`${opts.productName} is ready — ${opts.publicId}.`];

  if (opts.fileCount > 1) {
    lines.push(`${opts.fileCount} files, pick the one you like best.`);
  }

  if (opts.needsClaim) {
    lines.push(
      '',
      'To keep them in your dashboard, set a password with the sign-in code',
      'from this chat: https://agenticcore.click/claim',
      'The code is not the password — it chooses one.'
    );
  } else {
    lines.push('', 'Also saved to your dashboard: https://agenticcore.click/dashboard');
  }

  lines.push('Send /orders any time to find it again.');
  return lines.join('\n');
}
