import { grokImage, grokVisionChat } from './grok.ts';
import { fetchAttachments, type FetchedAttachment } from './attachments.ts';
import { uploadDeliverable } from './storage.ts';
import { addTaskFile } from './task.ts';

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
