import { grokImage } from './grok.ts';
import { uploadDeliverable } from './storage.ts';
import { addTaskFile } from './task.ts';

// Every image-producing service on .click promises multiple options, never
// just one -- generate them in parallel and store each as its own
// task_files row (option_index 1..count) under the task's current version.
export async function generateImageOptions(
  taskId: string,
  prompt: string,
  count: number,
  version = 1
): Promise<string[]> {
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const bytes = await grokImage(prompt);
      const { url } = await uploadDeliverable(taskId, `option-${i + 1}.png`, bytes, 'image/png');
      await addTaskFile(taskId, { url, fileType: 'image', optionIndex: i + 1, version });
      return url;
    })
  );
  return results;
}
