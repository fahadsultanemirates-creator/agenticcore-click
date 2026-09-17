// The Telegram owner bot's conversational brain -- replaces the old
// single-shot classifyIntent. Persists real message history per chat_id so
// the bot can ask a follow-up and remember the answer next message (e.g.
// "make a report" -> "which URL?" -> "agenticcore.agency" completes it),
// the same way Forge holds a conversation on the client side. Dispatched
// by telegram-webhook to the exact same handler functions either way --
// only the NLU layer gained memory, task-creation logic didn't change.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { claudeChat } from './claude.ts';
import { catalogMenu } from './catalog.ts';
import { ownerTaskBriefForPrompt } from './accounts.ts';
import type { BotIntent } from './intent.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TASK_TYPES = ['website', 'pdf', 'image', 'video', 'social', 'documents', 'brand-kit'];

const SYSTEM_PROMPT = `You route messages (typed or voice-transcribed, in any language, sometimes with an attached photo/document) to an internal owner-only bot for agenticcore.click. You have the full recent conversation history -- use it. If a prior message of yours asked a follow-up question, the client's next message is very likely answering it; resolve the intent using both messages together rather than re-asking from scratch.

Determine the intent and extract its arguments. Valid intents and their exact argument shapes:
{"intent":"queue"}
{"intent":"help"}
{"intent":"stats"} -- how the business is doing: how many accounts exist, how many are funded, how much has been delivered
{"intent":"new","sku":number,"brief":string,"referenceFiles":string[]|omit,"details":object|omit} -- if the conversation includes "[attached: <urls>]", copy those exact URLs into referenceFiles when creating a task that benefits from them (website/image/video/documents/brand-kit); never invent a URL
  "details" carries the structured choices a task type needs, and ONLY the ones the owner actually stated -- never guess or fill one in to look complete; anything omitted gets a sensible default downstream. Per type: "video" -> {length:"short"|"long", avatarStyle:"standard"|"premium"|"elite"|"none", resolution:"720p"|"1080p" (short only), noAvatarMode:"full"|"hybrid" (only when avatarStyle is "none"), duration:e.g."30s" (long only)}. "social" -> {requestType:"posts"|"profile"|"captions"|"gbp", platforms:string[], optionCount:1-5}. "image" -> {imageType:string, optionCount:1-5}. "pdf" -> {docType:"Presentation (PowerPoint)"|"Brochure"|"Business card"|"Flyer"|"Banner"|"Other"}. "documents" -> {docType:"invoice"|"terms"|"plan"|"proposal"|"contract", language:"en"|"ur"|"both"}. "brand-kit" -> {item:one of the brand-kit items}. "website" -> {tier:"small"|"large", businessName:string}. If a detail matters and the owner did not say it, prefer asking (intent "ask") over inventing it.

  "sku" is the product NUMBER from the catalog below. Pick the single number whose product is what was actually asked for. The catalog is a closed list -- never invent a number, and never route to a near-miss because it sounds similar. A logo is 30, not a brand-kit item. A letterhead is 72, not a presentation. If two numbers seem possible, ask (intent "ask") rather than guessing.

A product marked "NEEDS PACKAGES AND PRICES BEFORE IT CAN BE BUILT" cannot be built without an offer. If the owner has not given packages and prices for one of those, use intent "ask" to request them rather than creating the task -- it would only stop and ask anyway, after taking a place in the queue.

PRODUCT CATALOG:
${catalogMenu(true)}

{"intent":"revise","taskId":"AC-CLICK-####","note":string}
{"intent":"files","taskId":"AC-CLICK-####"}
{"intent":"status","taskId":"AC-CLICK-####"} -- ANY question about how a task is doing, why it is stuck, what information it still needs, or whether it is finished. Always use this rather than answering from the conversation: the real reason a task stopped is recorded against that task and you cannot know it from memory. If the message does not name a task, put your best guess at the reference in taskId -- it is checked against the real list, and the right one is found from the message wording if your guess is wrong.
{"intent":"deliver","taskId":"AC-CLICK-####","url":string}
{"intent":"avatars","gender":"male"|"female"|omit}
{"intent":"voices","filter":string|omit}
{"intent":"addavatar","id":string,"name":string}
{"intent":"addvoice","id":string,"name":string}
{"intent":"report","url":string}
{"intent":"ask","question":string} -- use this when you're missing something you need (a task ID, a URL, which type, etc.) instead of guessing. Keep the question short and in English (it gets translated/spoken to the owner automatically downstream) -- it will be asked, and the owner's next message will answer it.
{"intent":"chat","reply":string} -- a greeting, small talk, a question about what you can do, or anything conversational that isn't asking you to actually do one of the actions above. Reply naturally and briefly, like a sharp assistant who knows this whole system -- not a canned "unrecognized command" message.
{"intent":"unknown"} -- only when the owner is clearly asking for an action but you truly cannot tell which one, even loosely (chat/small talk is never "unknown" -- use "chat" for that).

Respond with ONLY the matching JSON object, nothing else.`;

export async function converse(chatId: string, text: string, attachmentUrls: string[] = []): Promise<BotIntent> {
  const userContent = attachmentUrls.length > 0 ? `${text}\n\n[attached: ${attachmentUrls.join(', ')}]` : text;

  await supabaseAdmin.from('bot_messages').insert({
    chat_id: chatId,
    role: 'user',
    content: userContent,
    attachments: attachmentUrls.map((url) => ({ url }))
  });

  const { data: history } = await supabaseAdmin
    .from('bot_messages')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(40);

  // Read fresh each turn rather than left to the history: which tasks exist and
  // what state they are in changes between messages, and the whole point is
  // that the bot answers from the record instead of from what it recalls.
  const taskBrief = await ownerTaskBriefForPrompt();

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: taskBrief },
    ...((history ?? []) as { role: 'user' | 'assistant'; content: string }[])
  ];

  let intent: BotIntent = { intent: 'unknown' };
  try {
    const raw = await claudeChat(messages, { maxTokens: 1000, effort: 'medium' });
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.intent === 'string') intent = parsed as BotIntent;
  } catch (err) {
    console.error('converse: Claude call/parse failed', err);
  }

  await supabaseAdmin.from('bot_messages').insert({
    chat_id: chatId,
    role: 'assistant',
    content: JSON.stringify(intent)
  });

  return intent;
}
