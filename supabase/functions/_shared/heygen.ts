// Thin wrapper around HeyGen's avatar video API, plus catalog browsing and
// client-custom-avatar/voice creation. HEYGEN_AVATAR_ID/VOICE_ID (single
// house pair) remain the fallback for tasks where the client didn't pick
// anything -- everything else here lets a specific avatar/voice be chosen
// per task, either from the owner-curated catalog or a client's own
// custom avatar/voice.

const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY')!;
const HEYGEN_AVATAR_ID = Deno.env.get('HEYGEN_AVATAR_ID')!;
const HEYGEN_VOICE_ID = Deno.env.get('HEYGEN_VOICE_ID')!;
const HEYGEN_API = 'https://api.heygen.com';
const HEYGEN_UPLOAD_API = 'https://upload.heygen.com';

export interface VideoDimension {
  width: number;
  height: number;
}

export interface CharacterChoice {
  type: 'avatar' | 'talking_photo';
  providerId: string;
}

export async function submitHeygenVideo(script: string, dimension: VideoDimension, character: CharacterChoice, voiceId: string): Promise<string> {
  const characterPayload =
    character.type === 'talking_photo'
      ? { type: 'talking_photo', talking_photo_id: character.providerId }
      : { type: 'avatar', avatar_id: character.providerId, avatar_style: 'normal' };

  const resp = await fetch(`${HEYGEN_API}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: characterPayload,
          voice: { type: 'text', input_text: script, voice_id: voiceId }
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

export const DEFAULT_AVATAR: CharacterChoice = { type: 'avatar', providerId: HEYGEN_AVATAR_ID };
export const DEFAULT_VOICE_ID = HEYGEN_VOICE_ID;

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

export interface CatalogAvatar {
  providerId: string;
  name: string;
  gender: string | null;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
}

export async function listAvatars(): Promise<CatalogAvatar[]> {
  const resp = await fetch(`${HEYGEN_API}/v2/avatars`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY }
  });
  if (!resp.ok) {
    throw new Error(`HeyGen list avatars failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const avatars = data?.data?.avatars ?? [];
  return avatars.map((a: any) => ({
    providerId: a.avatar_id,
    name: a.avatar_name,
    gender: a.gender ?? null,
    previewImageUrl: a.preview_image_url ?? null,
    previewVideoUrl: a.preview_video_url ?? null
  }));
}

export interface CatalogVoice {
  providerId: string;
  name: string;
  language: string | null;
  gender: string | null;
  previewAudioUrl: string | null;
}

export async function listVoices(): Promise<CatalogVoice[]> {
  const resp = await fetch(`${HEYGEN_API}/v3/voices`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY }
  });
  if (!resp.ok) {
    throw new Error(`HeyGen list voices failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const voices = data?.data ?? [];
  return voices.map((v: any) => ({
    providerId: v.voice_id,
    name: v.name,
    language: v.language ?? null,
    gender: v.gender ?? null,
    previewAudioUrl: v.preview_audio_url ?? null
  }));
}

// Talking photo: HeyGen's instant custom-avatar path -- one uploaded photo,
// no training job, no polling. Returns the talking_photo_id synchronously.
export async function uploadTalkingPhoto(imageBytes: Uint8Array, contentType: string): Promise<string> {
  const resp = await fetch(`${HEYGEN_UPLOAD_API}/v1/talking_photo`, {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': contentType },
    body: imageBytes
  });
  if (!resp.ok) {
    throw new Error(`HeyGen talking photo upload failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const id = data?.data?.talking_photo_id;
  if (typeof id !== 'string' || !id) {
    throw new Error('HeyGen talking photo upload returned no talking_photo_id');
  }
  return id;
}

async function uploadAsset(bytes: Uint8Array, contentType: string): Promise<string> {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: contentType }));
  const resp = await fetch(`${HEYGEN_API}/v3/assets`, {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY },
    body: form
  });
  if (!resp.ok) {
    throw new Error(`HeyGen asset upload failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const assetId = data?.data?.asset_id ?? data?.asset_id;
  if (typeof assetId !== 'string' || !assetId) {
    throw new Error('HeyGen asset upload returned no asset_id');
  }
  return assetId;
}

// Voice cloning is async -- HeyGen trains it. Returns a voice_clone_id to
// poll (see voice-clone-poll), not a usable voice_id yet.
export async function cloneVoice(audioBytes: Uint8Array, contentType: string, voiceName: string): Promise<string> {
  const assetId = await uploadAsset(audioBytes, contentType);

  const resp = await fetch(`${HEYGEN_API}/v3/voices/clone`, {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio: { type: 'asset_id', asset_id: assetId },
      voice_name: voiceName
    })
  });
  if (!resp.ok) {
    throw new Error(`HeyGen voice clone request failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  const cloneId = data?.data?.voice_clone_id;
  if (typeof cloneId !== 'string' || !cloneId) {
    throw new Error('HeyGen voice clone returned no voice_clone_id');
  }
  return cloneId;
}

export interface VoiceCloneStatus {
  status: 'pending' | 'ready' | 'failed' | string;
  voiceId?: string;
  error?: string;
}

export async function checkVoiceCloneStatus(voiceCloneId: string): Promise<VoiceCloneStatus> {
  const resp = await fetch(`${HEYGEN_API}/v3/voices/${voiceCloneId}`, {
    headers: { 'X-Api-Key': HEYGEN_API_KEY }
  });
  if (!resp.ok) {
    throw new Error(`HeyGen voice clone status check failed (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return {
    status: data?.data?.status,
    voiceId: data?.data?.voice_id,
    error: data?.data?.error?.message
  };
}
