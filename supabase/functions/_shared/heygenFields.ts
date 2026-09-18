// Finding the preview audio on a HeyGen voice, whatever they called it.
//
// /v3/voices returned every voice correctly -- name, language, gender -- and
// then "(no preview audio)" on all of them, because we read
// `preview_audio_url` and the response does not use that key. Hard-coding a
// second guess would fail the same way the first did, silently, and only
// show up as five voices nobody can listen to.
//
// So instead of naming the field, this recognises it: a string value, under a
// key that is about audio or previews, that is actually a URL. That holds
// across preview_audio, preview_audio_url, sample_url and anything else they
// rename it to next, and it cannot quietly return something that is not a
// link.

const URL_LIKE = /^https?:\/\//i;
const AUDIO_KEY = /audio|preview|sample/i;

export function previewAudioUrl(voice: Record<string, unknown>): string | null {
  // Prefer a key that mentions audio outright over a generic "preview",
  // so a preview IMAGE on a voice record can never win.
  const candidates = Object.entries(voice).filter(
    ([key, value]) => typeof value === 'string' && URL_LIKE.test(value) && AUDIO_KEY.test(key)
  ) as [string, string][];

  const named = candidates.find(([key]) => /audio|sample/i.test(key));
  return (named ?? candidates[0])?.[1] ?? null;
}
