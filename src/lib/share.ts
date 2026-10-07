// Sharing finished work out of the site.
//
// Deliberately links, not a page: /projects/:id is behind a login, so
// sending somebody that URL sends them to a sign-in screen for an account
// they do not have. The deliverables bucket is public-read, so the file
// links themselves are the thing that actually opens for whoever receives
// them -- on WhatsApp, in an email, anywhere.
//
// navigator.share hands that to the phone's own share sheet, which is
// every platform the device knows about and nothing we have to integrate.
// Where it does not exist (most desktop browsers) the links go to the
// clipboard instead, which is the same job done by hand.

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * The message that goes out, built here so the wording is testable and so
 * a five-option logo does not arrive as five bare URLs with no idea what
 * they are.
 */
export function shareMessage(opts: { title: string; urls: string[] }): string {
  const { title, urls } = opts;
  if (urls.length === 0) return title;
  if (urls.length === 1) return `${title}\n${urls[0]}`;

  const numbered = urls.map((url, index) => `${index + 1}. ${url}`);
  return [`${title} — ${urls.length} options:`, ...numbered].join("\n");
}

/**
 * Share, or failing that copy.
 *
 * A cancelled share is not a failure: the sheet opening and the person
 * changing their mind is the system working, and an error toast for it
 * would be a lie. Browsers signal it with AbortError.
 */
export async function shareOrCopy(opts: { title: string; urls: string[] }): Promise<ShareResult> {
  const text = shareMessage(opts);
  // A lone link goes in `url` as well as the text: share targets that
  // understand a URL render a preview from it rather than a line of text.
  const single = opts.urls.length === 1 ? opts.urls[0] : undefined;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(single ? { title: opts.title, text: opts.title, url: single } : { title: opts.title, text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Fall through: some browsers expose share and then refuse it (an
      // insecure context, a permissions policy). The clipboard still works.
      console.error("share failed, copying instead:", err);
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (err) {
    console.error("clipboard failed:", err);
    return "failed";
  }
}
