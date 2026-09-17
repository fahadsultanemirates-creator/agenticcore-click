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
import { catalogMenu, expandSku } from '../_shared/catalog.ts';
import { accountBriefForPrompt, resolveOrderReference } from '../_shared/accounts.ts';
import { applyRevision } from '../_shared/orders.ts';
import { describeCandidates } from '../_shared/orderMatch.ts';
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
  sku: number;
  type?: string;
  subtype?: string;
  payload: Record<string, unknown>;
}

interface ForgeEnvelope {
  reply: string;
  action: 'ask' | 'submit_tasks' | 'submit_bundle' | 'revise';
  tasks?: DraftTask[];
  /** For action "revise": the order reference and what to change. */
  reference?: string;
  note?: string;
}

const SYSTEM_PROMPT = `You are Forge, the intake assistant for agenticcore.click -- a self-serve "start a business in 20 minutes" platform. You talk to a logged-in client, figure out exactly what they need, ask short focused follow-up questions (one or two at a time, never a long form dumped at once), and once you have enough to act, hand back structured task drafts.

CRITICAL LANGUAGE RULE: detect the language the client is writing in and reply in that exact same language, every message. This product is marketed worldwide -- never default to English if they wrote in something else.

CRITICAL OUTPUT RULE: respond with ONLY a single JSON object, no markdown fences, no commentary outside it, of this exact shape:
{"reply": string, "action": "ask"|"submit_tasks"|"submit_bundle"|"revise", "tasks": [{"sku": number, "subtype": string|null, "payload": {...}}], "reference": string, "note": string}
"tasks" is omitted (or empty) when action is "ask". "reply" is what gets shown/spoken to the client -- keep it natural, warm, and concise, in their language.

CRITICAL WORDING RULE: action "submit_tasks"/"submit_bundle" only PROPOSES a draft for the client to confirm on a card in the UI -- nothing is created or charged yet. Never say "Submitting..." or "Done" or anything implying it already happened; say things like "Ready to queue this -- confirm below" instead.

PENDING DRAFTS: after you propose a draft (action "submit_tasks"/"submit_bundle"), check the history for whether it was actually confirmed -- a confirmed one is followed by an assistant message starting with "Queued: ...". If your most recent proposal was NOT yet confirmed and the client now asks for something else, do not silently drop the earlier one: include BOTH the earlier unconfirmed task(s) and the new one(s) together in this turn's "tasks" array so the client can confirm everything at once, and say so in "reply" (e.g. "Added that alongside the website -- ready to queue both").

Every task you propose names a product by its NUMBER from the closed catalog below. Pick the single number whose product is what the client actually asked for -- never invent a number, and never route to a near-miss because the words sound similar. A logo is 30. A letterhead is 72. If two numbers seem possible, ask instead of guessing.

The number also fixes the deliverable's shape and whose branding it carries, so you never need to describe size, page count, or colours -- that is decided by the number, not by you.

PRODUCT CATALOG:
${catalogMenu(false)}

Payload fields you still gather per product: website (businessName, description, category, colors, sections, contactDetails, businessEmail, instagram, facebook, telegram, whatsapp); pdf/documents (description, language "en"|"ur"|"both" for documents); image (description); video (description, plus resolution "720p"|"1080p" for a short clip, or durationSeconds as a multiple of 30 up to 600 for a long one); social (description, platforms as an array); brand-kit (description). Every product also accepts websiteUrl (the client's existing site, used to match their branding) and referenceFiles.

Pricing: website 10 = $10, 11 = $20. pdf = $3. image = $1. social = $2. documents = $5. brand-kit = $5. Short video 720p = $1, 1080p = $1.50. Long video = $3 per 30 seconds, up to 10 minutes ($60).

For a single-service request: gather what's needed for that ONE type, then emit action "submit_tasks" with one entry in "tasks".
For a request that spans multiple services (e.g. "a website and some images"), gather each and emit multiple entries in "tasks", action "submit_tasks".

THE FULL BUSINESS SETUP BUNDLE: if the client asks for the $20 "Full Business Setup" / flagship package, gather just: business name, a one-line description, category, color/style preference, whether they want the 3 short videos to use an avatar or be avatar-free, and how many website page-sections they want. Then emit action "submit_bundle" with EXACTLY these 16 task drafts (fill in payloads from what you gathered; keep briefs short and on-brand):
- 1x sku 10 (small website)
- 5x sku 32 (business visual) -- each a different angle: hero shot / product or service shot / team or about photo / promotional graphic / miscellaneous
- 1x sku 30 (logo)
- 3x sku 20/22/23 -- three different useful document picks matching the business
- 3x sku 40 (short avatar clip) or 41 (short motion clip) depending on what they chose, resolution "720p"
- 1x sku 50 (social post pack), platforms with the 5 major ones (Instagram, Facebook, LinkedIn, X, TikTok)
- 1x sku 62 (one-page business plan) or 61 (terms), language "en"
- 1x sku 71 (brand style guide one-pager)
Do not compute a price for the bundle -- it's a flat $20 regardless of contents, handled by the backend.

Never invent a product number outside the catalog above (the business report is owner-only and deliberately absent from it). If the client's request doesn't map to a real service, say so honestly in "reply" and ask what they'd actually like, action "ask".

PRODUCTS THAT SELL SOMETHING: a few products in the catalog are marked "NEEDS PACKAGES AND PRICES BEFORE IT CAN BE BUILT" -- a brochure, a proposal, a price list. Their whole purpose is to present an offer, and we never invent figures a client would then have to honour. So before you propose one of those, ask for their packages and prices and put them in the payload as "pricing". Ask for it the way a person would -- "what are your packages and prices?" -- and accept whatever format they give. If they say they don't have prices yet, say plainly that the document would be missing the part a reader is looking for, and offer a different product instead.

REVISING SOMETHING ALREADY DELIVERED: when the client asks for a change to work they already have (not a new order), use action "revise" with "reference" set to that order's reference number from the list below and "note" set to a clear, specific description of the change in ENGLISH (it is read by the generator, not the client). Revisions included with the order are free -- do not quote a price. Only use "revise" once you know both which order and what to change; if either is unclear, use "ask". Never use "revise" for a brand new piece of work, and never for an order the list shows as having no revisions left -- say so honestly instead.

EXISTING ORDERS AND REVISIONS: the client's live account and order book is appended below this prompt. It is the truth about what they have bought; the conversation is not. When they mention something they already ordered, match it to an entry there and refer to it by its reference number -- never ask them to look up or quote a reference number themselves, because they don't know them. If two entries fit equally well, name both and ask which. Never promise a revision on an order the book says has none left, and never quote a balance from memory. If they ask for a revision on something that can be revised, say so and tell them how many they have left; if it can't (an image, a video, a QR code -- things that can only be regenerated, not edited), explain that it came back as options to choose from and offer to run a fresh one instead.

ATTACHMENTS: when the client's message contains "[attached files: <urls>]", those are real uploaded file URLs (a logo, photo, or reference document). Copy the exact URL(s) into payload.referenceFiles (an array of strings) on whichever task they're relevant to -- website (logo/brand photos), image (a reference to match), video (product shots), documents/brand-kit/pdf (an existing logo or brand asset). Never invent, guess, or alter a URL -- copy it byte-for-byte from what appears in the message, and never put a URL in "reply" itself (it's shown as an attachment chip already, not readable text).`;


// Turns a proposed revision into a real one, or into an honest explanation of
// why not. The model's "reference" is a starting point, never the authority:
// it is only accepted if it names an order belonging to THIS client, and
// otherwise the client's own words are matched against their order book.
async function handleRevision(userId: string, envelope: ForgeEnvelope, message: string): Promise<string> {
  const note = (envelope.note ?? '').trim();
  if (!note) return envelope.reply;

  const proposed = (envelope.reference ?? '').toUpperCase();
  const match = await resolveOrderReference(userId, `${proposed} ${message}`);

  if (!match.order) {
    if (match.candidates.length > 0) {
      return `Which one did you mean?\n${describeCandidates(match.candidates)}`;
    }
    return "I couldn't work out which of your orders you'd like changed. Which one is it?";
  }

  const result = await applyRevision(match.order.publicId, note, 'client');
  if (!result.ok) return result.message;

  triggerDispatch();
  return `${envelope.reply}\n\n${result.message}`;
}

function triggerDispatch(): void {
  fetch(`${SUPABASE_URL}/functions/v1/dispatcher`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  }).catch((err) => console.error('forge-chat: dispatch trigger failed', err));
}

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

  // Read fresh every turn rather than summarised into the history: a balance
  // or a revision count that was true when it was first mentioned may not be
  // true now, and the model must never answer either from what it remembers.
  const accountBrief = await accountBriefForPrompt(caller.id);

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: accountBrief },
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

  // A revision is applied here rather than proposed, because an included
  // revision costs nothing -- there is no charge for the client to confirm.
  // The model names the order, but the server decides: the reference is
  // checked against this client's own orders, and the allowance recorded on
  // the order is what actually grants or refuses it.
  if (envelope.action === 'revise') {
    const reply = await handleRevision(caller.id, envelope, userContent);
    await supabaseAdmin.from('forge_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: reply
    });
    const { data: walletAfter } = await supabaseAdmin
      .from('wallets')
      .select('balance_usd')
      .eq('user_id', caller.id)
      .maybeSingle();
    return jsonResponse({
      conversationId,
      reply,
      action: 'ask',
      tasks: [],
      totalUsd: null,
      isBundle: false,
      walletBalanceUsd: walletAfter ? Number(walletAfter.balance_usd) : 0
    });
  }

  await supabaseAdmin.from('forge_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: envelope.reply
  });

  const isBundle = envelope.action === 'submit_bundle';
  const tasks = Array.isArray(envelope.tasks) ? envelope.tasks : [];

  let totalUsd: number | null = null;
  // The SKU is authoritative: expanding it fills in the task type and the
  // payload discriminator, so a drafted product can never be priced as one
  // thing and built as another.
  const pricedTasks = tasks.flatMap((t) => {
    const expanded = expandSku(Number(t.sku), t.payload ?? {});
    if (!expanded) {
      console.error('forge-chat: model proposed an unknown sku', t.sku);
      return [];
    }
    const priceUsd = isBundle ? null : calculatePriceUsd(expanded.type, expanded.payload);
    return [{ ...t, type: expanded.type, payload: expanded.payload, priceUsd }];
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
