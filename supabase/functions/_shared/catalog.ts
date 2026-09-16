// THE PRODUCT CATALOG -- the single place that says what each thing we sell
// actually IS.
//
// Why this exists: a task type like "brand-kit" covers eight completely
// different deliverables, from a one-page letterhead to a QR table tent.
// Before this file, the only thing telling the model which shape to produce
// was prose in a prompt, so it guessed -- and a request for a one-page
// letterhead came back as a fifteen-page presentation in agenticcore's own
// dark/yellow theme instead of the client's brand colours. That is not a
// model failure, it's a missing spec: nothing in the system stated "a
// letterhead is exactly 1 page and carries the CLIENT's branding".
//
// So every product gets a stable number (its SKU) and a machine-readable
// spec. Routing picks a number; renderers obey that number's spec. The model
// chooses WHAT the client wants, never HOW big it is or whose colours it
// wears.
//
// Numbering is grouped by service in blocks of ten rather than 1..35, so a
// new product can be added to a block forever without renumbering anything
// that already exists. A SKU, once issued, never changes meaning.

export type Branding =
  | 'client' // the deliverable IS the client's own material -- their colours, never ours
  | 'agenticcore'; // our own analysis/report about them -- our brand is correct here

export type Renderer =
  | 'asset' // one finished, ready-to-use page (renderBrandKitAsset)
  | 'deck' // a multi-page document/report (renderDocumentPdf)
  | 'images' // N generated image options
  | 'video' // an avatar or motion clip
  | 'site' // a deployed website
  | 'qr'; // a QR code artifact

// How a single-page asset is laid out.
//
// 'stationery' is paper you type ON: branding at the top, the contact strip at
// the bottom, and a deliberately EMPTY middle. That emptiness is the product --
// it is where the client's own letter goes. Without this distinction the
// generator treats a letterhead like every other asset and fills the page,
// which is what produced a letterhead containing "[Date] / [Recipient name] /
// Dear [Name] / [Letter text]": a letter template, not stationery.
//
// Everything else is 'content': a flyer, a price list, a business card are all
// meant to be full.
export type AssetLayout = 'stationery' | 'content';

export type UrlUse =
  | 'brand' // visit the client's site and take its identity (colours, copy, socials)
  | 'analyse' // visit the site and critique it -- the site is the SUBJECT, not the style
  | 'none';

export interface CatalogItem {
  sku: number;
  code: string;
  /** The task `type` this product is dispatched as -- unchanged from today. */
  service: string;
  name: string;
  /** Payload fields that identify this exact product within its service. */
  selector: Record<string, string>;
  renderer: Renderer;
  branding: Branding;
  /** The hard output contract. Renderers enforce this; the model cannot widen it. */
  output: {
    /** Exact page count. A letterhead is 1. Absent = variable. */
    pages?: number;
    /** Upper bound when the count is genuinely variable (reports). */
    maxPages?: number;
    /** How many options the client picks between. */
    options?: number;
  };
  urlUse: UrlUse;
  /** Only meaningful for renderer 'asset'. Defaults to 'content'. */
  layout?: AssetLayout;
  /**
   * How many free revisions this product includes.
   *
   * Revisions exist for deliverables that can be EDITED -- a website, a
   * document, a single-page asset -- where "move the header, change that
   * line" is a real, cheap operation on work that already exists.
   *
   * They do not exist for deliverables that can only be REGENERATED. Asking
   * an image or video model to change one detail re-rolls the whole thing
   * into something different, which is a new attempt, not a revision. Those
   * products ship several options instead, and choosing between them IS the
   * revision. Renderers 'images', 'video' and 'qr' are therefore always 0 --
   * an invariant the catalog test asserts, so it cannot quietly drift back.
   *
   * Copied onto the task at creation and enforced at the revise path, never
   * trusted to a prompt.
   */
  revisions: number;
  /** Plain words a client or the owner might actually use, to help routing. */
  aliases: string[];
  ownerOnly?: boolean;
}

export const CATALOG: CatalogItem[] = [
  // ---- 10s: Website -------------------------------------------------
  {
    sku: 10,
    code: 'WEB-SMALL',
    service: 'website',
    name: 'Website — small (2–4 sections)',
    selector: { tier: 'small' },
    renderer: 'site',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 2,
    aliases: ['small website', 'simple site', 'one page website', 'landing page'],
  },
  {
    sku: 11,
    code: 'WEB-LARGE',
    service: 'website',
    name: 'Website — large (4–10 sections)',
    selector: { tier: 'large' },
    renderer: 'site',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 2,
    aliases: ['big website', 'full website', 'multi page site'],
  },

  // ---- 20s: PDF & documents (designed pieces) -----------------------
  {
    sku: 20,
    code: 'PDF-DECK',
    service: 'pdf',
    name: 'Presentation deck',
    selector: { docType: 'Presentation (PowerPoint)' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 15 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['presentation', 'powerpoint', 'slides', 'pitch deck'],
  },
  {
    sku: 21,
    code: 'PDF-BROCHURE',
    service: 'pdf',
    name: 'Brochure',
    selector: { docType: 'Brochure' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 6 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['brochure', 'tri-fold', 'leaflet'],
  },
  {
    sku: 22,
    code: 'PDF-CARD',
    service: 'pdf',
    name: 'Business card',
    selector: { docType: 'Business card' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['business card', 'visiting card', 'name card'],
  },
  {
    sku: 23,
    code: 'PDF-FLYER',
    service: 'pdf',
    name: 'Flyer',
    selector: { docType: 'Flyer' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['flyer', 'handbill', 'one pager'],
  },
  {
    sku: 24,
    code: 'PDF-BANNER',
    service: 'pdf',
    name: 'Banner',
    selector: { docType: 'Banner' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['banner', 'standee', 'roll up'],
  },
  {
    sku: 25,
    code: 'PDF-OTHER',
    service: 'pdf',
    name: 'Other designed document',
    selector: { docType: 'Other' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 10 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['document', 'other'],
  },

  // ---- 30s: Images --------------------------------------------------
  {
    sku: 30,
    code: 'IMG-LOGO',
    service: 'image',
    name: 'Logo',
    selector: { imageType: 'Logo' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['logo', 'logomark', 'brand mark', 'emblem'],
  },
  {
    sku: 31,
    code: 'IMG-AVATAR',
    service: 'image',
    name: 'Avatar image',
    selector: { imageType: 'Avatar' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'none',
    revisions: 0,
    aliases: ['avatar', 'profile picture', 'headshot'],
  },
  {
    sku: 32,
    code: 'IMG-BUSINESS',
    service: 'image',
    name: 'Business visual',
    selector: { imageType: 'Business visual' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['business image', 'hero image', 'banner image'],
  },
  {
    sku: 33,
    code: 'IMG-PRODUCT',
    service: 'image',
    name: 'Product shot',
    selector: { imageType: 'Product shot' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['product photo', 'product shot', 'packshot'],
  },
  {
    sku: 34,
    code: 'IMG-ILLUSTRATION',
    service: 'image',
    name: 'Illustration',
    selector: { imageType: 'Illustration' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'none',
    revisions: 0,
    aliases: ['illustration', 'artwork', 'drawing'],
  },
  {
    sku: 35,
    code: 'IMG-OTHER',
    service: 'image',
    name: 'Other image',
    selector: { imageType: 'Other' },
    renderer: 'images',
    branding: 'client',
    output: { options: 5 },
    urlUse: 'none',
    revisions: 0,
    aliases: ['image', 'picture', 'graphic'],
  },

  // ---- 40s: Video ---------------------------------------------------
  {
    sku: 40,
    code: 'VID-SHORT-AVATAR',
    service: 'video',
    name: 'Short avatar clip (≤15s)',
    selector: { length: 'short', avatarStyle: 'standard' },
    renderer: 'video',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['short video with presenter', 'avatar clip', 'talking head'],
  },
  {
    sku: 41,
    code: 'VID-SHORT-MOTION',
    service: 'video',
    name: 'Short motion clip, no avatar (≤15s)',
    selector: { length: 'short', avatarStyle: 'none' },
    renderer: 'video',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['promo clip', 'b-roll', 'motion video', 'no avatar video'],
  },
  {
    sku: 42,
    code: 'VID-LONG-AVATAR',
    service: 'video',
    name: 'Long avatar video (30s–10min)',
    selector: { length: 'long', avatarStyle: 'standard' },
    renderer: 'video',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['long video', 'explainer', 'full promo'],
  },

  // ---- 50s: Social --------------------------------------------------
  {
    sku: 50,
    code: 'SOC-POSTS',
    service: 'social',
    name: 'Social post pack',
    selector: { requestType: 'posts' },
    renderer: 'images',
    branding: 'client',
    output: { options: 3 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['posts', 'post pack', 'social designs', 'instagram posts'],
  },
  {
    sku: 51,
    code: 'SOC-PROFILE',
    service: 'social',
    name: 'Profile kit (picture + cover)',
    selector: { requestType: 'profile' },
    renderer: 'images',
    branding: 'client',
    output: { options: 3 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['profile kit', 'cover photo', 'banner', 'profile picture'],
  },
  {
    sku: 52,
    code: 'SOC-CAPTIONS',
    service: 'social',
    name: 'Caption & hashtag pack',
    selector: { requestType: 'captions' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 6 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['captions', 'hashtags', 'copy for posts'],
  },
  {
    sku: 53,
    code: 'SOC-GBP',
    service: 'social',
    name: 'Google Business Profile content',
    selector: { requestType: 'gbp' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 4 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['google business', 'gbp', 'google profile', 'maps listing'],
  },

  // ---- 60s: Business documents (text instruments) -------------------
  {
    sku: 60,
    code: 'DOC-INVOICE',
    service: 'documents',
    name: 'Invoice / quotation template',
    selector: { docType: 'invoice' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['invoice', 'quotation', 'bill'],
  },
  {
    sku: 61,
    code: 'DOC-TERMS',
    service: 'documents',
    name: 'Terms & Conditions + Privacy Policy',
    selector: { docType: 'terms' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 8 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['terms', 'privacy policy', 't&c', 'legal'],
  },
  {
    sku: 62,
    code: 'DOC-PLAN',
    service: 'documents',
    name: 'One-page business plan',
    selector: { docType: 'plan' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['business plan', 'pitch one pager'],
  },
  {
    sku: 63,
    code: 'DOC-PROPOSAL',
    service: 'documents',
    name: 'Proposal / quote template',
    selector: { docType: 'proposal' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 5 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['proposal', 'quote', 'offer'],
  },
  {
    sku: 64,
    code: 'DOC-CONTRACT',
    service: 'documents',
    name: 'Service agreement template',
    selector: { docType: 'contract' },
    renderer: 'deck',
    branding: 'client',
    output: { maxPages: 8 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['contract', 'agreement', 'service agreement'],
  },

  // ---- 70s: Brand & marketing kit -----------------------------------
  // Every one of these is a single finished artifact in the CLIENT's brand.
  // This block is where the letterhead failure happened; the specs below are
  // what makes that impossible to repeat.
  {
    sku: 70,
    code: 'BK-NAME',
    service: 'brand-kit',
    name: 'Business name + tagline options',
    selector: { item: 'Business name + tagline generator' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['business name', 'tagline', 'slogan', 'naming'],
  },
  {
    sku: 71,
    code: 'BK-STYLEGUIDE',
    service: 'brand-kit',
    name: 'Brand style guide one-pager',
    selector: { item: 'Brand style guide one-pager' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['style guide', 'brand guide', 'brand sheet'],
  },
  {
    sku: 72,
    code: 'BK-LETTERHEAD',
    service: 'brand-kit',
    name: 'Letterhead design',
    selector: { item: 'Letterhead design' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    // The one product whose middle must stay empty -- see AssetLayout.
    layout: 'stationery',
    revisions: 1,
    aliases: ['letterhead', 'letter head', 'company letter paper'],
  },
  {
    sku: 73,
    code: 'BK-SIGNATURE',
    service: 'brand-kit',
    name: 'Email signature design',
    selector: { item: 'Email signature design' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['email signature', 'mail footer'],
  },
  {
    sku: 74,
    code: 'BK-PRICELIST',
    service: 'brand-kit',
    name: 'Price list / menu design',
    selector: { item: 'Price list / menu design' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['price list', 'menu', 'rate card'],
  },
  {
    sku: 75,
    code: 'BK-QR-CARD',
    service: 'brand-kit',
    name: 'QR-code business card',
    selector: { item: 'QR-code business card' },
    renderer: 'qr',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['qr card', 'qr business card'],
  },
  {
    sku: 76,
    code: 'BK-QR-TENT',
    service: 'brand-kit',
    name: 'QR-code table tent',
    selector: { item: 'QR-code table tent' },
    renderer: 'qr',
    branding: 'client',
    output: { options: 1 },
    urlUse: 'brand',
    revisions: 0,
    aliases: ['table tent', 'qr stand', 'table qr'],
  },
  {
    sku: 77,
    code: 'BK-COMINGSOON',
    service: 'brand-kit',
    name: '"Coming soon" teaser page',
    selector: { item: '"Coming soon" teaser page' },
    renderer: 'asset',
    branding: 'client',
    output: { pages: 1 },
    urlUse: 'brand',
    revisions: 1,
    aliases: ['coming soon', 'teaser page', 'launching soon'],
  },

  // ---- 90s: Owner-only ----------------------------------------------
  {
    sku: 90,
    code: 'OWN-REPORT',
    service: 'business-report',
    name: 'Website business report',
    selector: {},
    renderer: 'deck',
    // The one product that legitimately wears OUR brand: it is our analysis
    // OF the client's site, not a deliverable they put their own name on.
    branding: 'agenticcore',
    output: { maxPages: 15 },
    urlUse: 'analyse',
    revisions: 1,
    aliases: ['business report', 'website audit', 'site review'],
    ownerOnly: true,
  },
];

const BY_SKU = new Map(CATALOG.map((item) => [item.sku, item]));

export function getSku(sku: number): CatalogItem | null {
  return BY_SKU.get(sku) ?? null;
}

// Resolves an existing task payload to its catalog entry, so workers gain the
// spec without any change to how tasks are stored. Matches the most specific
// selector first: a selector with two matching fields beats one with a single
// field, which is what separates a short avatar clip from a long one.
export function resolveSku(type: string, payload: Record<string, unknown>): CatalogItem | null {
  let best: CatalogItem | null = null;
  let bestScore = -1;

  for (const item of CATALOG) {
    if (item.service !== type) continue;

    const keys = Object.keys(item.selector);
    const matches = keys.every((key) => String(payload[key] ?? '') === item.selector[key]);
    if (!matches) continue;

    if (keys.length > bestScore) {
      best = item;
      bestScore = keys.length;
    }
  }

  return best;
}

// Turns a routed SKU back into the task shape the queue already stores. The
// selector fields ARE the payload fields, so routing by number also fills in
// the discriminator correctly -- picking 72 guarantees
// `item: 'Letterhead design'` rather than a near-miss string the model typed
// from memory, which is how "logo" ended up filed as brand-kit.
export function expandSku(
  sku: number,
  payload: Record<string, unknown> = {}
): { type: string; payload: Record<string, unknown> } | null {
  const item = getSku(sku);
  if (!item) return null;
  return {
    type: item.service,
    payload: { ...payload, ...item.selector, sku: item.sku }
  };
}

// The hard shape contract, phrased for a generation prompt. This is the
// sentence that stops a one-page letterhead becoming a fifteen-page deck:
// the page count is stated as a requirement, not left to the model's taste.
export function shapeInstruction(item: CatalogItem): string {
  const parts: string[] = [`You are producing: ${item.name}.`];

  if (item.layout === 'stationery') {
    parts.push(
      'This is STATIONERY: printed paper the client types their own letter onto. Produce ONLY the fixed ' +
        'printed matter -- the identity block that sits at the top of every sheet, and the contact strip that ' +
        'sits at the foot of every sheet. The middle of the page stays EMPTY; that empty space is the whole ' +
        'point of the product. Never write a date, a recipient, a salutation, body text, a sign-off, or any ' +
        'placeholder standing in for them -- the client writes those themselves, on top of this.'
    );
  } else if (item.output.pages === 1) {
    parts.push(
      'This is a SINGLE PAGE deliverable. Produce exactly one section. It is a finished, ready-to-use ' +
        'artifact, never a report, a specification, or a multi-page document.'
    );
  } else if (item.output.maxPages !== undefined) {
    parts.push(
      `This is a multi-page document of AT MOST ${item.output.maxPages} pages, so produce at most ` +
        `${item.output.maxPages} sections. Use only as many as the brief genuinely needs -- never pad to reach the limit.`
    );
  }

  if (item.branding === 'client') {
    parts.push(
      "This deliverable belongs to the CLIENT and carries THEIR branding. Never reference agenticcore, .click, " +
        'or our own colours anywhere in it.'
    );
  } else {
    parts.push('This is our own analysis document and correctly carries agenticcore branding.');
  }

  return parts.join(' ');
}

// A compact, model-readable menu. Given to Forge and the Telegram classifier
// so routing picks a NUMBER out of a closed list instead of inventing a shape.
export function catalogMenu(includeOwnerOnly = false): string {
  return CATALOG.filter((item) => includeOwnerOnly || !item.ownerOnly)
    .map((item) => {
      const shape =
        item.output.pages !== undefined
          ? `exactly ${item.output.pages} page`
          : item.output.maxPages !== undefined
            ? `up to ${item.output.maxPages} pages`
            : item.output.options !== undefined
              ? `${item.output.options} option(s)`
              : 'variable';
      return `${item.sku} = ${item.name} [${item.service}] (${shape}; ${item.branding} branding) -- also called: ${item.aliases.join(', ')}`;
    })
    .join('\n');
}
