// What an outside agent is allowed to put in front of a client.
//
// Pure and on its own, because this is a security rule rather than a
// detail of the Grok Bot flow: anything staged was uploaded by a process we
// do not run, and promoting it makes it public on our own domain and hands
// it to a paying client.
//
// So the deliverable types are a list, not a guess. An HTML file or a
// script in the deliverables bucket is served from our own domain, which
// is somebody else's problem to exploit and ours to have allowed.
//
// SVG is deliberately absent. It is an image everywhere except in a
// browser, where it is a document that can carry script -- and these are
// served from our own domain, to our own clients. Our QR codes are SVGs we
// generate ourselves and never pass through here.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'video/mp4',
  'audio/mpeg',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

/** 50 MB. Large enough for a video, small enough that a runaway upload is caught. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function fileProblem(fileType: string | null, bytes: number): string | null {
  if (bytes === 0) return 'the file is empty';
  if (bytes > MAX_FILE_BYTES) return `the file is ${Math.round(bytes / 1024 / 1024)} MB, over the 50 MB limit`;
  if (!fileType) return 'no file type was declared';
  const base = fileType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(base)) return `"${base}" is not a deliverable type we publish`;
  return null;
}
