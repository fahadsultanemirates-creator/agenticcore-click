// xAI's real text-to-video API (api.x.ai/v1/videos/*) -- confirmed against
// docs.x.ai, not guessed. Async, same submit-then-poll shape as HeyGen:
// POST /v1/videos/generations returns a request_id, GET /v1/videos/{id}
// is polled until status is 'done' (video.url), 'failed', or 'expired'.
// grok-imagine-video-1.5 caps a single generation at 15 seconds -- there
// is no multi-clip stitching here, so anything longer than that is the
// caller's responsibility to flag (see worker-video).

const XAI_API_KEY = Deno.env.get('XAI_API_KEY')!;
const XAI_BASE_URL = 'https://api.x.ai/v1';
const VIDEO_MODEL = Deno.env.get('XAI_VIDEO_MODEL') || 'grok-imagine-video-1.5';

export type VideoAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3';
export type VideoResolution = '480p' | '720p' | '1080p';

export interface VideoGenerationOptions {
  durationSeconds?: number; // 1-15
  aspectRatio?: VideoAspectRatio;
  resolution?: VideoResolution;
  imageUrl?: string; // image-to-video mode
  generateAudio?: boolean;
}

export async function submitGrokVideo(prompt: string, opts: VideoGenerationOptions = {}): Promise<string> {
  const body: Record<string, unknown> = { model: VIDEO_MODEL, prompt };
  if (opts.durationSeconds) body.duration = Math.min(15, Math.max(1, Math.round(opts.durationSeconds)));
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.imageUrl) body.image = opts.imageUrl;
  if (opts.generateAudio !== undefined) body.generate_audio = opts.generateAudio;

  const resp = await fetch(`${XAI_BASE_URL}/videos/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    throw new Error(`xAI video generation failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  if (typeof data?.request_id !== 'string' || !data.request_id) {
    throw new Error('xAI video generation returned no request_id');
  }
  return data.request_id;
}

export interface GrokVideoStatus {
  status: 'pending' | 'done' | 'expired' | 'failed' | string;
  videoUrl?: string;
  error?: string;
}

export async function checkGrokVideoStatus(requestId: string): Promise<GrokVideoStatus> {
  const resp = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
    headers: { Authorization: `Bearer ${XAI_API_KEY}` }
  });
  if (!resp.ok) {
    throw new Error(`xAI video status check failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return {
    status: data?.status,
    videoUrl: data?.video?.url,
    error: data?.error
  };
}
