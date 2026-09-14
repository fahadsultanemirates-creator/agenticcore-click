// Thin wrapper around HeyGen's avatar video API. One default avatar/voice
// pair is configured for the whole product (HEYGEN_AVATAR_ID/VOICE_ID) --
// clients don't bring their own avatar, so standard/premium/elite tiers
// currently price the same underlying generation (flagged where used,
// not silently pretended otherwise).

const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY')!;
const HEYGEN_AVATAR_ID = Deno.env.get('HEYGEN_AVATAR_ID')!;
const HEYGEN_VOICE_ID = Deno.env.get('HEYGEN_VOICE_ID')!;
const HEYGEN_API = 'https://api.heygen.com';

export interface VideoDimension {
  width: number;
  height: number;
}

export async function submitHeygenVideo(script: string, dimension: VideoDimension): Promise<string> {
  const resp = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: HEYGEN_AVATAR_ID, avatar_style: 'normal' },
          voice: { type: 'text', input_text: script, voice_id: HEYGEN_VOICE_ID }
        }
      ],
      dimension
    })
  });

  if (!resp.ok) {
    throw new Error(`HeyGen video submission failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const videoId = data?.data?.video_id;
  if (typeof videoId !== 'string' || !videoId) {
    throw new Error('HeyGen submission returned no video_id');
  }
  return videoId;
}

export interface HeygenStatus {
  status: 'processing' | 'completed' | 'failed' | 'pending' | string;
  videoUrl?: string;
  error?: string;
}

export async function checkHeygenStatus(videoId: string): Promise<HeygenStatus> {
  const resp = await fetch(`${HEYGEN_API}/v1/video_status.get?video_id=${videoId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY }
  });
  if (!resp.ok) {
    throw new Error(`HeyGen status check failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return {
    status: data?.data?.status,
    videoUrl: data?.data?.video_url,
    error: data?.data?.error?.message
  };
}
