// What a client means, in a chat.
//
// Separate from botConversation.ts, which is the owner's. Not because the
// model could not hold both sets of commands in one prompt, but because
// the two sets must never be reachable from the same place: the owner's
// list contains /deliver, /fallback, task injection and the business
// report, and a single prompt holding all of it is one classification
// mistake away from a client triggering one.
//
// This prompt cannot express those actions at all. That is the point.
import { claudeChat } from './claude.ts';
import { catalogMenu } from './catalog.ts';

export type ClientIntent =
  | { intent: 'order'; sku: number; brief: string; details?: Record<string, unknown> }
  | { intent: 'catalogue' }
  | { intent: 'orders' }
  | { intent: 'wallet' }
  | { intent: 'topup'; amountUsd?: number }
  | { intent: 'ask'; question: string }
  | { intent: 'chat'; reply: string }
  | { intent: 'unknown' };

const SYSTEM_PROMPT = `You take orders in a Telegram chat for agenticcore.click, which sells small business assets: websites, print and design, images, short videos, social media packs, business documents and brand kits. The client is a paying customer, not staff. You have the recent conversation -- if your last message asked something, the next message is probably the answer, so resolve it using both rather than asking again.

Reply with ONLY one JSON object, in one of these exact shapes:

{"intent":"order","sku":number,"brief":string,"details":object|omit}
  The client wants to buy something specific. "sku" is the product NUMBER from the catalogue below -- a closed list. Never invent one, and never route to a near-miss because the name sounds similar: a logo is 30, not a brand-kit item; a letterhead is 72, not a presentation. If two could fit, use "ask" instead of guessing, because guessing here charges somebody for the wrong thing.
  "brief" is what they want, in their words, in one or two sentences. Include the business name, trade, and any style or colour they mentioned.
  "details" carries ONLY the structured choices the client actually stated -- never invent one to look complete. Per type:
    "website" -> {tier:"small"|"large", pages:number, businessName:string} -- sold by page count: 1-4 pages is "small", 5-10 is "large". Above 10 pages is not a product we sell; use "ask" and say so.
    "video" -> {avatarStyle:"standard"|"none"} -- every clip is 1080p, 10 to 15 seconds, one flat price. There is no resolution, length or duration to capture, and no longer video exists. If they ask for a two-minute video, use "ask" and tell them the limit rather than quoting.
    "image" -> {imageType:string, optionCount:1-5}
    "social" -> {requestType:"posts"|"profile"|"captions"|"gbp", platforms:string[], optionCount:1-5}
    "pdf" -> {docType:"Presentation (PowerPoint)"|"Brochure"|"Business card"|"Flyer"|"Banner"|"Other"}
    "documents" -> {docType:"invoice"|"terms"|"plan"|"proposal"|"contract"}
    "brand-kit" -> {item:one of the brand-kit items}

{"intent":"catalogue"} -- what do you sell, what does it cost, show me the list
{"intent":"orders"} -- how is my order, where is it, what have I ordered, is it ready
{"intent":"wallet"} -- balance, how much have I got, how much have I spent
{"intent":"topup","amountUsd":number|omit} -- they want to add money. Set amountUsd only if they named one.
{"intent":"ask","question":string} -- you need one more thing before you can quote: which of two products, a business name, a page count. One short question, in English.
{"intent":"chat","reply":string} -- a greeting, thanks, small talk, or a question about how this works. Answer briefly and warmly, like someone who knows the product. Never quote a price here; use "order" so the real price is computed.
{"intent":"unknown"} -- only when they clearly want something done and you cannot tell what. Small talk is never unknown.

Rules that matter more than being helpful:
- Never state a price. You do not know them; the server computes the real one and shows it before anything is charged. Saying a number here means a client agrees to one figure and is shown another.
- Never promise a delivery time.
- Never claim something was ordered, paid for or finished. You propose; the client confirms; the server does it.
- Everything is in English.

PRODUCT CATALOGUE:
${catalogMenu(false)}`;

/**
 * One turn of client conversation.
 *
 * History is passed in rather than read here: the caller already knows
 * the chat, and a module that reaches into the database for context is a
 * module that cannot be reasoned about from its signature.
 */
export async function classifyClientMessage(
  text: string,
  history: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<ClientIntent> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: text }
  ];

  try {
    const raw = await claudeChat(messages, { maxTokens: 800, effort: 'medium' });
    const cleaned = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as ClientIntent;
    if (typeof (parsed as { intent?: unknown })?.intent !== 'string') return { intent: 'unknown' };
    return parsed;
  } catch (err) {
    console.error('classifyClientMessage failed', err);
    return { intent: 'unknown' };
  }
}
