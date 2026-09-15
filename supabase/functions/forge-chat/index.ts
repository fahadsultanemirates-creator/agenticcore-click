// Forge -- the client-facing conversational intake. Holds a real multi-turn
// conversation (full history replayed to Claude each turn), gathers whatever
// a given service needs, and -- once it has enough -- hands back a
// structured set of task drafts for the client to confirm. This function
// never creates a task or touches the wallet itself; forge-submit does
// that, after the client explicitly confirms in the UI (see Forge.tsx).
//
// Bypasses the per-service dashboard forms entirely: a client can describe
// what they want in plain language (any language -- this product is
// marketed worldwide, not to one region) and Forge asks whatever follow-up
// questions it needs, the same way a human intake person would.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claudeChat } from '../_shared/claude.ts';
import { calculatePriceUsd, FULL_BUSINESS_SETUP_USD } from '../_shared/pricing.ts';
import { jsonResponse, CORS_HEADERS } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function resolveCaller(authHeader: string): Promise<{ id: string } | null> {
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

interface DraftTask {
  type: string;
  subtype?: string;
  payload: Record<string, unknown>;
}

interface ForgeEnvelope {
  reply: string;
  action: 'ask' | 'submit_tasks' | 'submit_bundle';
  tasks?: DraftTask[];
}

const SYSTEM_PROMPT = `You are Forge, the intake assistant for agenticcore.click -- a self-serve "start a business in 20 minutes" platform. You talk to a logged-in client, figure out exactly what they need, ask short focused follow-up questions (one or two at a time, never a long form dumped at once), and once you have enough to act, hand back structured task drafts.

CRITICAL LANGUAGE RULE: detect the language the client is writing in and reply in that exact same language, every message. This product is marketed worldwide -- never default to English if they wrote in something else.

CRITICAL OUTPUT RULE: respond with ONLY a single JSON object, no markdown fences, no commentary outside it, of this exact shape:
{"reply": string, "action": "ask"|"submit_tasks"|"submit_bundle", "tasks": [{"type": string, "subtype": string|null, "payload": {...}}]}
"tasks" is omitted (or empty) when action is "ask". "reply" is what gets shown/spoken to the client -- keep it natural, warm, and concise, in their language.

CRITICAL WORDING RULE: action "submit_tasks"/"submit_bundle" only PROPOSES a draft for the client to confirm on a card in the UI -- nothing is created or charged yet. Never say "Submitting..." or "Done" or anything implying it already happened; say things like "Ready to queue this -- confirm below" instead.

PENDING DRAFTS: after you propose a draft (action "submit_tasks"/"submit_bundle"), check the history for whether it was actually confirmed -- a confirmed one is followed by an assistant message starting with "Queued: ...". If your most recent proposal was NOT yet confirmed and the client now asks for something else, do not silently drop the earlier one: include BOTH the earlier unconfirmed task(s) and the new one(s) together in this turn's "tasks" array so the client can confirm everything at once, and say so in "reply" (e.g. "Added that alongside the website -- ready to queue both").

The real services you can create tasks for, and the EXACT payload fields each needs (use these field names precisely -- unknown fields are ignored, missing required ones make the task unpriceable and get rejected):

1. type "website" -- payload: {tier: "small"(2-4 pages, $49)|"large"(4-10 pages, $99), businessName, logoChoice: "generate"|"upload", sections: string[], description, category, colors, styleReferenceUrl, services, notes, contactDetails, businessEmail, instagram, facebook, telegram, whatsapp}. tier and businessName are the only truly required fields -- everything else can be skipped/"you decide".

2. type "pdf" -- payload: {docType: one of "Presentation (PowerPoint)"|"Brochure"|"Business card"|"Flyer"|"Banner"|"Other", description, websiteUrl}. $15 flat.

3. type "image" -- payload: {imageType: one of "Avatar"|"Business visual"|"Product shot"|"Illustration"|"Other" (or a custom short label like "Logo"), description, optionCount: 1-5 (default 3)}. $8 flat per task (task always returns optionCount image options).

4. type "video" -- payload: {length: "short"|"long", avatarStyle: "standard"|"premium"|"elite"|"none", resolution: "720p"|"1080p" (short only), noAvatarMode: "full"|"hybrid" (only when avatarStyle is "none" and length is "short"), duration (long only, e.g. "30s"), description}. Pricing: short+avatarStyle none: full=$10, hybrid=$25. short+avatar: standard 720p=$15/1080p=$20, premium $30/$40, elite $55/$70. long+none=$50, long+avatar: standard=$60, premium=$120, elite=$200. Avatar/voice selection (custom or catalog) happens in the dashboard's picker after task creation if needed -- don't try to gather avatar IDs in chat, just gather style/length/description.

5. type "social" -- payload: {requestType: "posts"|"profile"|"captions"|"gbp", platforms: string[] (e.g. ["Instagram","Facebook"]), description, optionCount: 1-5 (default 3, only affects "posts"/"profile")}. $18 flat.

6. type "documents" -- payload: {docType: one of "invoice"|"terms"|"plan"|"proposal"|"contract", description, language: "en"|"ur"|"both"}. $10 flat.

7. type "brand-kit" -- payload: {item: one of "Business name + tagline generator"|"Brand style guide one-pager"|"Letterhead design"|"Email signature design"|"Price list / menu design"|"QR-code business card"|"QR-code table tent"|"\\"Coming soon\\" teaser page", description}. $10 flat.

For a single-service request: gather what's needed for that ONE type, then emit action "submit_tasks" with one entry in "tasks".
For a request that spans multiple services (e.g. "a website and some images"), gather each and emit multiple entries in "tasks", action "submit_tasks".

THE FULL BUSINESS SETUP BUNDLE: if the client asks for the $20 "Full Business Setup" / flagship package, gather just: business name, a one-line description, category, color/style preference, whether they want the 3 short videos to use an avatar or be avatar-free, and how many website page-sections they want. Then emit action "submit_bundle" with EXACTLY these 16 task drafts (fill in payloads from what you gathered; keep briefs short and on-brand):
- 1x type "website", payload.tier "small"
- 5x type "image", each payload.imageType "Business visual" with a different angle (hero shot / product or service shot / team or about photo / promotional graphic / miscellaneous), payload.optionCount 3
- 1x type "image", payload.imageType "Logo", payload.optionCount 5
- 3x type "pdf", 3 different useful document picks (e.g. Presentation, Business card, Flyer) matching the business
- 3x type "video", length "short", the avatarStyle they chose ("standard" if avatar, "none" with noAvatarMode "full" if avatar-free), resolution "720p"
- 1x type "social", requestType "posts", platforms with the 5 major ones (Instagram, Facebook, LinkedIn, X, TikTok), payload.optionCount 5
- 1x type "documents", pick a sensible docType (usually "plan" or "terms"), language "en"
- 1x type "brand-kit", pick a sensible item (usually "Brand style guide one-pager")
Do not compute a price for the bundle -- it's a flat $20 regardless of contents, handled by the backend.

Never invent a task type outside the 7 listed above (business-report is owner-only, not available here). If the client's request doesn't map to a real service, say so honestly in "reply" and ask what they'd actually like, action "ask".

ATTACHMENTS: when the client's message contains "[attached files: <urls>]", those are real uploaded file URLs (a logo, photo, or reference document). Copy the exact URL(s) into payload.referenceFiles (an array of strings) on whichever task they're relevant to -- website (logo/brand photos), image (a reference to match), video (product shots), documents/brand-kit/pdf (an existing logo or brand asset). Never invent, guess, or alter a URL -- copy it byte-for-byte from what appears in the message, and never put a URL in "reply" itself (it's shown as an attachment chip already, not readable text).`;

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  const caller = await resolveCaller(authHeader);
  if (!caller) return jsonResponse({ error: 'Not authenticated' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const attachmentUrls: string[] = Array.isArray(body?.attachmentUrls) ? body.attachmentUrls.filter((u: unknown) => typeof u === 'string') : [];
  if (!message && attachmentUrls.length === 0) return jsonResponse({ error: 'Empty message' }, 400);

  let conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;

  if (conversationId) {
    const { data: convo } = await supabaseAdmin
      .from('forge_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', caller.id)
      .maybeSingle();
    if (!convo) conversationId = null; // not ours / doesn't exist -- start fresh rather than 404
  }

  if (!conversationId) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('forge_conversations')
      .insert({ user_id: caller.id })
      .select('id')
      .single();
    if (createError || !created) {
      console.error('forge-chat: could not create conversation', createError);
      return jsonResponse({ error: 'Could not start a conversation. Please try again.' }, 500);
    }
    conversationId = created.id;
  }

  const userContent = attachmentUrls.length > 0 ? `${message}\n\n[attached files: ${attachmentUrls.join(', ')}]` : message;

  await supabaseAdmin.from('forge_messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: userContent || '(attachment only)',
    attachments: attachmentUrls.map((url) => ({ url }))
  });

  const { data: history } = await supabaseAdmin
    .from('forge_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(60);

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...((history ?? []) as { role: 'user' | 'assistant'; content: string }[])
  ];

  let envelope: ForgeEnvelope;
  try {
    const raw = await claudeChat(messages, { maxTokens: 4000 });
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.reply !== 'string' || typeof parsed?.action !== 'string') {
      throw new Error('Unexpected Forge response shape');
    }
    envelope = parsed as ForgeEnvelope;
  } catch (err) {
    console.error('forge-chat: Claude call/parse failed', err);
    envelope = { reply: "Sorry, I didn't quite catch that -- could you rephrase?", action: 'ask' };
  }

  await supabaseAdmin.from('forge_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: envelope.reply
  });

  const isBundle = envelope.action === 'submit_bundle';
  const tasks = Array.isArray(envelope.tasks) ? envelope.tasks : [];

  let totalUsd: number | null = null;
  const pricedTasks = tasks.map((t) => {
    const priceUsd = isBundle ? null : calculatePriceUsd(t.type, t.payload ?? {});
    return { ...t, priceUsd };
  });
  if (isBundle) {
    totalUsd = FULL_BUSINESS_SETUP_USD;
  } else if (envelope.action === 'submit_tasks' && pricedTasks.length > 0) {
    totalUsd = pricedTasks.every((t) => t.priceUsd !== null) ? pricedTasks.reduce((sum, t) => sum + (t.priceUsd ?? 0), 0) : null;
  }

  const { data: wallet } = await supabaseAdmin.from('wallets').select('balance_usd').eq('user_id', caller.id).maybeSingle();

  return jsonResponse({
    conversationId,
    reply: envelope.reply,
    action: envelope.action,
    tasks: pricedTasks,
    totalUsd,
    isBundle,
    walletBalanceUsd: wallet ? Number(wallet.balance_usd) : 0
  });
}

Deno.serve(handleRequest);
