// Read-only proxy onto HeyGen's live avatar/voice catalog. Useful for
// verifying HEYGEN_API_KEY works, and as a building block if a web-based
// catalog browser ever replaces browsing via the Telegram bot's
// /avatars /voices commands.

import { listAvatars, listVoices } from '../_shared/heygen.ts';
import { jsonResponse } from '../_shared/cors.ts';

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: {} });

  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');

  try {
    if (kind === 'voice') {
      const voices = await listVoices();
      return jsonResponse({ count: voices.length, voices });
    }
    if (kind === 'avatar') {
      const avatars = await listAvatars();
      return jsonResponse({ count: avatars.length, avatars });
    }
    return jsonResponse({ error: 'Pass ?kind=avatar or ?kind=voice' }, 400);
  } catch (err) {
    console.error('heygen-catalog failed', err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

Deno.serve(handleRequest);
