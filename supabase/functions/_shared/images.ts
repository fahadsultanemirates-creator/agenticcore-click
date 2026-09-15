import { grokImage, grokVisionChat } from './grok.ts';
import { fetchAttachments, type FetchedAttachment } from './attachments.ts';
import { uploadDeliverable } from './storage.ts';
import { addTaskFile } from './task.ts';

// Keeps every generated PDF's imagery visually consistent with the
// .click brand (dark void background, yellow-400 accent light) instead
// of each caller guessing a style. Used for the real cover/section
// visuals in renderDocumentPdf specs (see worker-pdf, worker-business-report)
// -- not stored as a task_files row/option since these are decorative
// document assets, not a deliverable the client picks between.
const BRAND_VISUAL_STYLE =
  'Dark, minimalist, premium business/tech aesthetic: near-black background, subtle golden-yellow accent ' +
  'lighting or geometric shapes, soft depth and glow, high-end abstract illustration. No text, no logos, no ' +
  "watermarks, no readable words, no people's faces.";

export async function generateBrandVisual(taskId: string, prompt: string, filename: string): Promise<string> {
  const bytes = await grokImage(`${prompt} ${BRAND_VISUAL_STYLE}`);
  const { url } = await uploadDeliverable(taskId, filename, bytes, 'image/png');
  return url;
}

// A document with many per-slide visuals (a business report can ask for
// close to 20 images) can't just Promise.all them all -- xAI's image
// model is rate-limited per second at the account level, and firing every
// request at once trips a 429 that fails the whole document. This runs a
// fixed number of requests at a time instead of the whole batch at once.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// xAI's image endpoint is text-to-image only -- there's no image-reference
// input to hand it a client's logo/photo directly. So when a reference is
// attached, one vision call first produces a detailed visual description
// (exact colors, style, composition), and that description gets folded
// into the generation prompt -- the honest version of "sees and uses it"
// given the API's actual constraints.
async function describeReference(attachments: FetchedAttachment[]): Promise<string> {
  try {
    return await grokVisionChat(
      'Describe this reference image in precise visual detail (exact colors, style, composition, mood) so ' +
        'another AI image generator can recreate a visually consistent result without seeing the image itself. ' +
        'Respond with ONLY the description, 2-3 sentences.',
      'Describe this reference image.',
      attachments,
      { maxTokens: 300 }
    );
  } catch (err) {
    console.error('describeReference failed, generating without it', err);
    return '';
  }
}

// Every image-producing service on .click promises multiple options, never
// just one -- generate them in parallel and store each as its own
// task_files row (option_index 1..count) under the task's current version.
export async function generateImageOptions(
  taskId: string,
  prompt: string,
  count: number,
  version = 1,
  referenceFileUrls?: unknown
): Promise<string[]> {
  const attachments = await fetchAttachments(referenceFileUrls);
  const referenceDescription = attachments.length > 0 ? await describeReference(attachments) : '';
  const finalPrompt = referenceDescription
    ? `${prompt} Match this reference's look: ${referenceDescription}`
    : prompt;

  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const bytes = await grokImage(finalPrompt);
      const { url } = await uploadDeliverable(taskId, `option-${i + 1}.png`, bytes, 'image/png');
      await addTaskFile(taskId, { url, fileType: 'image', optionIndex: i + 1, version });
      return url;
    })
  );
  return results;
}
