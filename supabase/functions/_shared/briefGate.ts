// Does the brief actually describe a job, or just name the product?
//
// The first real order through the bot was a logo, and what reached the
// owner was: "Brief: Client wants a logo created." That is not a brief.
// Nobody -- a model, a provider, or a person at a desk -- can make a logo
// from it, and the client had already been charged.
//
// requirements.ts does not catch this. It gates on productSpec.ts, which
// deliberately holds nothing for images, websites or videos: those go to a
// provider whole. So the one product most likely to be ordered in three
// words is the one with no gate at all. And the gates it does have run
// inside the workers -- after the charge, and never at all in manual mode,
// where no worker runs.
//
// This runs before the quote instead. Pure, so the rule is testable: a
// prompt asking for a good brief is a request, and the model that wrote
// "Client wants a logo created" had already been asked.

/** Words that carry no information about the job. */
const FILLER = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'my', 'our', 'me', 'us', 'i', 'we',
  'client', 'customer', 'user', 'wants', 'want', 'wanted', 'needs', 'need', 'needed', 'would', 'like', 'likes',
  'please', 'pls', 'kindly', 'just', 'some', 'something', 'anything', 'thing', 'it', 'this', 'that',
  'make', 'makes', 'making', 'made', 'create', 'creates', 'creating', 'created', 'build', 'building', 'built',
  'design', 'designs', 'designing', 'designed', 'do', 'does', 'get', 'got', 'give', 'send', 'new', 'good', 'nice',
  'can', 'could', 'you', 'is', 'are', 'be', 'have', 'has', 'hi', 'hello', 'thanks', 'thank', 'ok', 'okay', 'yes'
]);

/**
 * Nouns that name what was bought rather than what it is for.
 *
 * "logo" in "a logo" says nothing; the catalogue already knows it is a
 * logo. "logo" in "use the logo from our site" is instruction -- but that
 * brief carries other content words and clears the gate anyway, so
 * stripping the noun costs nothing and keeps the rule one line.
 */
const PRODUCT_NOUNS = new Set([
  'logo', 'logos', 'website', 'site', 'web', 'page', 'pages', 'video', 'clip', 'brochure', 'flyer', 'banner',
  'poster', 'card', 'cards', 'business', 'pack', 'kit', 'document', 'documents', 'doc', 'docs', 'invoice',
  'proposal', 'quote', 'contract', 'terms', 'policy', 'plan', 'image', 'images', 'picture', 'pictures', 'photo',
  'photos', 'post', 'posts', 'presentation', 'deck', 'slides', 'letterhead', 'profile', 'cover', 'caption',
  'captions', 'brand', 'branding', 'social', 'media', 'icon', 'graphic', 'graphics', 'design'
]);

/** How many words of actual subject matter a brief must carry. */
const MIN_CONTENT_WORDS = 2;

/** The brief with filler, the product's own name, and product nouns removed. */
export function contentWords(brief: string, productName = ''): string[] {
  const productOwnWords = new Set(
    productName
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );

  return brief
    .toLowerCase()
    .split(/[^a-z0-9'&]+/)
    .filter(Boolean)
    .filter((word) => !FILLER.has(word))
    .filter((word) => !PRODUCT_NOUNS.has(word))
    .filter((word) => !productOwnWords.has(word));
}

// What to ask for, per service. Phrased as the two or three facts that
// make the difference between a usable brief and a guess, because asking
// "tell me more" gets "it's for my shop" and we are back here.
const ASKS: Record<string, string> = {
  image: 'what the business is called, what it does, and any style or colours you have in mind',
  'brand-kit': 'what the business is called, what it does, and any style or colours you have in mind',
  pdf: 'what the business is called, what it does, and what this needs to say',
  social: 'what the business is called, what it does, and what these posts should be about',
  video: 'what the business is called and what the video should say',
  website: 'what the business is called, what it does, and roughly how many pages',
  documents: 'what the business is called, what it does, and who this is for'
};

const DEFAULT_ASK = 'what the business is called and what it does';

/**
 * One question, or null when the brief is good enough to charge for.
 *
 * Deliberately not a list of missing fields: a client who gets three
 * bullet points for a $1 logo abandons the order, and the three facts
 * below arrive in one sentence anyway.
 */
export function briefGap(opts: { productName: string; service: string; brief: string }): string | null {
  const words = contentWords(opts.brief ?? '', opts.productName);
  if (words.length >= MIN_CONTENT_WORDS) return null;

  const ask = ASKS[opts.service] ?? DEFAULT_ASK;
  return (
    `I can do that — but "${(opts.brief ?? '').trim() || '(nothing)'}" does not tell me enough to make something ` +
    `you would actually use.\n\n` +
    `For the ${opts.productName.toLowerCase()}, tell me ${ask}.\n\n` +
    `One sentence is plenty — "a logo for Noor Bakery, a small neighbourhood bakery, warm and handmade" — and I will quote it straight away.`
  );
}
