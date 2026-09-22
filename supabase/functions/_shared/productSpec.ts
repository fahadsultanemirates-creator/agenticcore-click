// WHAT EACH COMPOSED PRODUCT ACTUALLY IS.
//
// The catalog says a product's SHAPE -- how many pages, whose colours, which
// renderer. This file says its PURPOSE: what the thing is for in the client's
// world, and what makes it wrong even when it looks good.
//
// It exists because of a pattern that only became visible after a dozen
// deliverables. Products split cleanly into two kinds:
//
//   PROVIDER products -- a website, an image, a video. An outside API holds
//   both what the thing is and how to make it look right. Grok already knows
//   what a website is, so a five-page site was correct on the first command.
//
//   COMPOSED products -- a letterhead, a brochure, an invoice. The provider
//   is only a printer: PDFShift renders HTML that WE wrote. No outside
//   intelligence supplies the shape. Whatever spec we do not state, nobody
//   states.
//
// That is why a letterhead -- trivially easier than a website in real life --
// took six attempts while the website took one. It arrived with no definition
// attached. Every composed failure so far has been a missing sentence here:
//
//   - a letterhead came back as a letter, because nothing said the middle of
//     the page is deliberately empty and that emptiness IS the product;
//   - a brochure came back polished with no prices, because nothing said a
//     brochure without an offer is not a brochure.
//
// Both were found by asking one question, which is the question every spec
// below answers: WHAT WOULD MAKE THIS WRONG EVEN WHEN IT LOOKS GOOD?
//
// The other rule this file encodes is what to do about facts we do not have.
// There are exactly three options and only two are allowed:
//
//   required ("must")  -- the product cannot exist without it. Stop and ask.
//   optional ("nice")  -- include it when known, omit it silently when not.
//   invent             -- never. A made-up price is a promise the client has
//                         to honour; a made-up address is a lie on their
//                         stationery.
//
// A letterhead with no phone number is a correct letterhead. A price list
// with invented prices is a liability. That asymmetry is the whole rule.
//
// Deliberately pure: no database, no network, no imports. Field RESOLVERS --
// the code that decides whether a fact is actually available -- live in
// requirements.ts, because they need the brand profile. This file is the
// knowledge; that file is the lookup.

/** A fact a product may need. Sourced from the brief, the client's site, or an attachment. */
export type FieldKey =
  | 'topic'
  | 'businessName'
  | 'services'
  | 'packages'
  | 'contact'
  | 'colours'
  | 'jurisdiction'
  | 'targetUrl'
  | 'website'
  | 'logo'
  | 'tagline'
  | 'personName'
  | 'jobTitle'
  | 'address'
  | 'phone'
  | 'email'
  | 'socials'
  | 'audience'
  | 'paymentTerms'
  | 'bankDetails'
  | 'taxId'
  | 'launchDate'
  | 'fonts';

export interface FieldDef {
  /** Plain words, used both in prompts and in the question we ask the client. */
  label: string;
  /**
   * What to ask for when this field is REQUIRED and nowhere to be found.
   * Phrased so one reply answers it -- "please provide more detail" wastes
   * the client's next message.
   */
  ask: string;
}

export const FIELDS: Record<FieldKey, FieldDef> = {
  topic: { label: 'what it should be about', ask: 'what this should be about — a sentence is enough' },
  businessName: { label: 'the business name', ask: 'the business name exactly as it should be printed' },
  services: { label: 'what the business does', ask: 'what you actually do or sell — a short list is fine' },
  packages: {
    label: 'packages and prices',
    ask: 'your packages and prices, in any format (for example: Starter $X — what is included)'
  },
  contact: {
    label: 'how to reach the business',
    ask: 'at least one way for a reader to reach you — a phone number, email, WhatsApp or website'
  },
  colours: { label: 'the brand colours', ask: 'your brand colours — hex codes if you have them, otherwise name them' },
  jurisdiction: {
    label: 'the country or emirate whose law applies',
    ask: 'which country (and emirate or state) your business operates under — legal text is written around it'
  },
  targetUrl: { label: 'where the QR code should lead', ask: 'the exact link the QR code should open' },
  website: { label: 'the website address', ask: 'the website address' },
  logo: { label: 'the logo', ask: 'your logo file' },
  tagline: { label: 'the tagline', ask: 'your tagline, if you have one' },
  personName: { label: "the person's name", ask: 'the name to print' },
  jobTitle: { label: 'the job title', ask: 'the job title to print' },
  address: { label: 'the street address', ask: 'the address to print' },
  phone: { label: 'the phone number', ask: 'the phone number to print' },
  email: { label: 'the email address', ask: 'the email address to print' },
  socials: { label: 'social media handles', ask: 'your social media handles' },
  audience: { label: 'who it is for', ask: 'who the audience is' },
  paymentTerms: { label: 'payment terms', ask: 'your payment terms — for example 50% upfront, balance on delivery' },
  bankDetails: { label: 'payment details', ask: 'how customers pay you — bank details, or the payment link you use' },
  taxId: { label: 'the tax or VAT number', ask: 'your tax or VAT registration number' },
  launchDate: { label: 'the launch date', ask: 'the launch date, if you want one shown' },
  fonts: { label: 'the brand fonts', ask: 'your brand fonts' }
};

export interface ProductSpec {
  /** One sentence: what this thing IS to the person receiving it. */
  purpose: string;
  /**
   * What makes it WRONG even when it looks good. This is the sentence that
   * was missing every time a deliverable came back polished and useless, so
   * it goes into the generation prompt verbatim.
   */
  wrongWhen: string;
  /** Without these the product cannot exist. Missing -> stop and ask. */
  must: FieldKey[];
  /** Included when known, omitted in silence when not. Never invented. */
  nice: FieldKey[];
  /** Hard rules the generator must obey. Stated as requirements, not taste. */
  rules: string[];
  /**
   * How to actually build it, in order.
   *
   * The rules say what must be true of the result; this says what to put
   * where. Both were needed. Every product that failed a live test failed on
   * a construction step nobody had written down -- the empty middle of a
   * letterhead, the packages section of a brochure, the three-item limit in a
   * spoken script. Those are not judgements a model gets wrong, they are
   * instructions it was never given.
   */
  build: string[];
}

// Keyed by SKU. Only COMPOSED and HYBRID products appear here: websites,
// images and videos are delivered whole by a provider that already knows what
// they are, and adding our opinions to them is how we would break what works.
export const SPECS: Record<number, ProductSpec> = {
  // ---- 20s: PDF & designed documents --------------------------------
  20: {
    purpose: 'Slides a person stands up and presents from, one idea at a time.',
    wrongWhen: 'It reads like a document — paragraphs on a slide, or one topic spilling across two slides.',
    must: ['topic'],
    nice: ['businessName', 'logo', 'colours', 'services', 'contact'],
    rules: [
      'One idea per slide. A slide that needs a second slide to finish its point is two slides badly split.',
      'Headline plus a few short lines — never a paragraph.'
    ],
    build: [
      'Open on a title slide: the subject, and who it is for.',
      'Then one slide per idea, each a heading plus at most four short lines.',
      'Close on what the audience should do or decide.',
    ],
  },
  21: {
    purpose: 'A sales document: what they sell, what it costs, and how to buy it.',
    wrongWhen:
      'It has no prices, or no way to act on it. A brochure that describes a business without asking for the sale is an "about us" page, not a brochure.',
    must: ['packages', 'contact'],
    nice: ['businessName', 'logo', 'colours', 'services', 'address', 'socials'],
    rules: [
      'The packages and prices get a section of their own, laid out so a reader compares options at a glance.',
      'Reproduce every figure exactly as supplied. Never round, adjust, convert or invent one.',
      'The last page tells the reader exactly what to do next and how to reach them.'
    ],
    build: [
      'Cover: the business name and one line saying what they do.',
      'Then one section per service or theme, at most four of them.',
      'Then a packages section: every package, its price, and what is included.',
      'Close with how to buy and how to reach them.',
    ],
  },
  22: {
    purpose: 'A card handed to a person: who they are and how to reach them.',
    wrongWhen: 'It carries marketing copy. A business card is contact details, not a pitch.',
    must: ['businessName', 'contact'],
    nice: ['personName', 'jobTitle', 'logo', 'address', 'socials', 'website', 'colours'],
    rules: ['No sentences and no body copy — short labelled lines only.', 'At most eight lines in total.'],
    build: [
      'First line: the person\'s name, or the business name when no person is named.',
      'Second line: their role, when there is one.',
      'Then at most four contact lines — phone, email, website, address.',
      'Nothing else. No tagline, no sales line.',
    ],
  },
  23: {
    purpose: 'One page that makes a passer-by do something.',
    wrongWhen: 'It is a wall of text, or nothing on it tells the reader what to do next.',
    must: ['contact'],
    nice: ['businessName', 'logo', 'colours', 'packages', 'address', 'socials'],
    rules: ['One headline, one offer, one instruction.', 'Short lines. Nothing a reader has to study.'],
    build: [
      'A headline naming the offer.',
      'Two or three short lines of supporting detail.',
      'The offer itself: what the reader gets, and the price when one is supplied.',
      'One instruction to act on — call, visit, scan, come in.',
    ],
  },
  24: {
    purpose: 'Read from several metres away: a name, one line, a way to find them.',
    wrongWhen: 'It contains anything unreadable at a distance — paragraphs, small print, long lists.',
    must: ['businessName'],
    nice: ['logo', 'tagline', 'contact', 'website', 'colours'],
    rules: ['At most twelve words besides the contact line.', 'No body copy of any kind.'],
    build: [
      'The business name, the largest thing on it.',
      'One line saying what they do or what is on offer.',
      'One contact route, and nothing more.',
    ],
  },
  25: {
    purpose: 'Whatever document the brief names — the brief decides the shape.',
    wrongWhen: 'It invents a structure the brief never asked for, or pads to fill pages.',
    must: ['topic'],
    nice: ['businessName', 'logo', 'colours', 'contact'],
    rules: ['Follow the brief exactly. Use only as many sections as it genuinely needs.'],
    build: [
      'Read the brief and use exactly the structure it names.',
      'Give every section a heading a reader can scan.',
      'Stop when the brief is answered — never continue to fill a page.',
    ],
  },

  // ---- 40s: Video ----------------------------------------------------
  // HeyGen renders the presenter and Grok renders the motion clip, and
  // neither needs teaching. The SCRIPT is ours, and it is the part that
  // decides whether the video is worth the render.
  //
  // The first one proved the point in both directions. It opened with a real
  // hook and quoted the client's actual price -- and then simply stopped,
  // having told a viewer what the business is and never once what to do
  // about it. Fifteen seconds is too expensive to end on nothing.
  40: {
    purpose: 'A presenter says one thing to camera and tells the viewer what to do next.',
    wrongWhen:
      'It describes the business and never asks for anything. Fifteen seconds that end without a call to action is an advert that forgot its last line.',
    must: ['topic'],
    nice: ['businessName', 'services', 'packages', 'contact', 'website'],
    rules: [
      'At most 30 spoken words. The product is sold as fifteen seconds and a longer script simply runs past it.',
      'Name at most three things. A spoken list of four or more is heard as noise, and it is what pushes a clip past its length.',
      'Short sentences. A presenter reading a long comma-stacked sentence rushes it, and rushed speech is where the lip sync visibly drifts.',
      'The hook is the first sentence. Nobody reaches the second sentence of a video that opened slowly.',
      'End on one specific action — visit the site, send a message, book a call — named outright, not implied.',
      'Spoken words only. No stage directions, no scene headings, no music cues, no on-screen text instructions: every word is read aloud exactly as written.',
      'Never say a figure that was not supplied.'
    ],
    build: [
      'One sentence of hook.',
      'One or two sentences on what they do, naming at most three things.',
      'One closing sentence that names the action.',
    ],
  },
  41: {
    purpose: 'A short moving scene that shows the business, with nobody speaking.',
    wrongWhen:
      'It asks for dialogue or on-screen text. There is no presenter to say it, and generated lettering comes out as gibberish that makes the clip unusable.',
    must: ['topic'],
    nice: ['businessName', 'colours'],
    rules: [
      'Describe one scene: subject, camera movement, lighting, mood. Two or three sentences.',
      'Never ask for text, captions, logos, or a person speaking to camera.',
      'Ten seconds of material, no more.'
    ],
    build: [
      'Name the scene and its subject.',
      'Say how the camera moves.',
      'Say what the light and the mood are.',
    ],
  },
  42: {
    purpose: 'A presenter explains something properly, and closes by telling the viewer what to do.',
    wrongWhen:
      'It is one undifferentiated pitch with no shape, or it runs past the length that was paid for and gets cut.',
    must: ['topic'],
    nice: ['businessName', 'services', 'packages', 'contact', 'website'],
    rules: [
      'Roughly 150 spoken words per minute of the length ordered, and never more — the render runs past the length paid for otherwise.',
      'Short sentences throughout. A presenter reading a long comma-stacked sentence rushes it, and rushed speech is where the lip sync visibly drifts.',
      'Give it a shape: the hook, what it is, why it matters, what to do next.',
      'End on one specific action, named outright.',
      'Spoken words only. No stage directions, no scene headings, no music cues.',
      'Never say a figure that was not supplied.'
    ],
    build: [
      'A hook, one or two sentences.',
      'What it is.',
      'Why it matters, with a concrete example or a supplied figure.',
      'What to do next, named outright.',
    ],
  },

  // ---- 50s: Social ---------------------------------------------------
  50: {
    purpose: 'Ready-to-post graphics, each readable in a feed at thumbnail size.',
    wrongWhen: 'The text is too small or too long to read while scrolling, or the crop is wrong for the platform.',
    must: ['topic'],
    nice: ['businessName', 'logo', 'colours'],
    rules: ['Square 1:1 unless the brief names a platform that wants otherwise.', 'At most ten words on the image.'],
    build: [
      'One square graphic per idea.',
      'At most ten words laid on the image.',
      'The brand\'s colours; the logo small and out of the way.',
    ],
  },
  51: {
    purpose: "A profile picture and cover that fit the platform's exact crops.",
    wrongWhen: 'The logo or face is cut off by the circular profile crop, or the cover centre is obscured by overlaid UI.',
    must: ['businessName'],
    nice: ['logo', 'colours'],
    rules: [
      'The profile image is square with everything important inside the safe circle.',
      'The cover is wide with its centre kept clear.'
    ],
    build: [
      'A square profile image with everything important inside the safe circle.',
      'A wide cover image with its centre kept clear.',
    ],
  },
  52: {
    purpose: 'Copy the client pastes straight into posts: captions with matching hashtags.',
    wrongWhen: 'It reads like an article, or the hashtags are generic instead of being about their business and their place.',
    must: ['topic'],
    nice: ['businessName', 'services', 'address', 'socials', 'website'],
    rules: ['Each caption at most forty words.', 'Hashtags grouped under their own caption, not scattered through it.'],
    build: [
      'One caption per post idea, at most forty words each.',
      'Under each caption, five to ten hashtags about this business and its place.',
      'Keep each caption and its hashtags together, so one can be copied at a time.',
    ],
  },
  53: {
    purpose: 'The exact fields Google Business Profile asks for: description, services, posts, questions.',
    wrongWhen: 'It is free-form marketing copy instead of the named fields, or it exceeds the limits Google enforces.',
    must: ['businessName', 'services'],
    nice: ['address', 'phone', 'website', 'packages'],
    rules: [
      'Label every block with the Google field it is pasted into.',
      'The business description is at most 750 characters.'
    ],
    build: [
      'A business description of at most 750 characters.',
      'The services list, one per line.',
      'Two or three post drafts.',
      'Three or four questions a customer would ask, each with its answer.',
      'Label every block with the Google field it is pasted into.',
    ],
  },

  // ---- 60s: Business documents ---------------------------------------
  // The template rule below is the letterhead lesson in another form: a
  // template's blanks are the product. Filling them with invented customers
  // and amounts produces a document that looks finished and cannot be used.
  60: {
    purpose: 'A form the client issues to get paid: their details, the customer, line items, total, how to pay.',
    wrongWhen: 'There is no way to actually pay it, or it arrives pre-filled with an invented customer and amounts.',
    must: ['businessName', 'contact'],
    nice: ['logo', 'address', 'paymentTerms', 'bankDetails', 'taxId', 'colours'],
    rules: [
      'This is a TEMPLATE. Everything that changes per invoice — customer, invoice number, date, line items, amounts — is an empty labelled field, never invented content.',
      'Include a total line and a stated way to pay.'
    ],
    build: [
      'Header: the issuing business, its address and contact, and its tax number when supplied.',
      'Blank labelled fields for what changes per invoice: number, date, due date, and the customer.',
      'A line-item table: description, quantity, rate, amount.',
      'Totals: subtotal, tax, and the amount due.',
      'Payment terms, and how the customer actually pays.',
    ],
  },
  61: {
    purpose: 'The legal text the client publishes: who they are, whose law applies, how they handle data.',
    wrongWhen: 'It names no jurisdiction, names the wrong entity, or promises practices the client never told us they follow.',
    must: ['businessName', 'jurisdiction'],
    nice: ['website', 'email', 'address', 'services'],
    rules: [
      'Name the governing country (and emirate or state) explicitly.',
      'Never state a practice that is not in the brief or on their site — no invented retention periods, processors or guarantees.',
      'Close with a line stating this is a template and not legal advice.'
    ],
    build: [
      'Name the business and the country whose law governs it.',
      'Terms: what is supplied, payment, liability, cancellation.',
      'Privacy: what is collected, why, how long it is kept, and who to contact.',
      'Close with the line stating this is a template and not legal advice.',
    ],
  },
  62: {
    purpose: 'One page a reader can decide from: what the business does, for whom, and how it makes money.',
    wrongWhen: 'It describes the business instead of planning it — no numbers, no model, nothing to decide on.',
    must: ['businessName', 'services'],
    nice: ['packages', 'audience', 'website', 'colours'],
    rules: [
      'Include how revenue is actually made — what is sold and at what price — using only figures that were supplied.',
      'Every line earns its place. One page means one page.'
    ],
    build: [
      'What the business does, in one short paragraph.',
      'Who it is for.',
      'How it makes money — what is sold and at what price, using supplied figures only.',
      'What it needs next, or what it is asking for.',
    ],
  },
  63: {
    purpose: 'What is being proposed, what it costs, and what the client does to accept it.',
    wrongWhen: 'The price is missing, or there is no acceptance step — a proposal a reader cannot say yes to.',
    must: ['packages', 'businessName'],
    nice: ['logo', 'contact', 'paymentTerms', 'colours'],
    rules: [
      'This is a TEMPLATE: the recipient, date and scope are empty labelled fields.',
      'Reproduce supplied figures exactly.',
      'End with an acceptance block — signature, name, date.'
    ],
    build: [
      'Cover: what is proposed, a blank labelled field for the recipient, and the date.',
      'The scope: what is included, and what is not.',
      'The price: each package, its figure, and what it covers.',
      'Timeline, or the steps that follow acceptance.',
      'An acceptance block: signature, name, date.',
    ],
  },
  64: {
    purpose: "The contract between the client and their own customer: scope, payment, term, termination.",
    wrongWhen: 'The parties or the governing law are unnamed, or it covers services the client does not offer.',
    must: ['businessName', 'services', 'jurisdiction'],
    nice: ['paymentTerms', 'address', 'email'],
    rules: [
      'This is a TEMPLATE: the other party is an empty labelled field, never an invented company.',
      'Signature blocks for both parties.',
      'Close with a line stating this is a template and not legal advice.'
    ],
    build: [
      'Parties: the business, and a blank labelled field for the other party.',
      'Scope of the services.',
      'Payment terms.',
      'Term, and how either side ends it.',
      'Governing law, naming the country.',
      'Signature blocks for both parties, then the template disclaimer.',
    ],
  },

  // ---- 70s: Brand & marketing kit ------------------------------------
  70: {
    purpose: 'A short list of usable business names, each with a tagline, to choose between.',
    wrongWhen: 'It offers one option, or the names are interchangeable word-salad that says nothing about the business.',
    must: ['topic'],
    nice: ['audience', 'colours'],
    rules: ['Between six and ten options.', 'Each option is a name plus exactly one tagline. Nothing else on the page.'],
    build: [
      'Six to ten options.',
      'Each one is a name, with a single tagline under it.',
      'No commentary and no explanation of the reasoning.',
    ],
  },
  71: {
    purpose: 'The rules someone needs to use this brand correctly: colours with codes, type, logo use.',
    wrongWhen: 'It describes the brand in prose instead of giving the actual usable values.',
    must: ['businessName', 'colours'],
    nice: ['logo', 'tagline', 'fonts'],
    rules: ['Colours as hex codes, not names.', 'State rules as do and do-not, never as paragraphs.'],
    build: [
      'The logo, and how it may and may not be used.',
      'The colours, each with its hex code.',
      'Type: which font for headings, which for body.',
      'A short do and do-not list.',
    ],
  },
  72: {
    purpose: 'Paper the client types their own letter onto.',
    wrongWhen:
      'The middle of the page is not empty. A date, a recipient, a salutation, body text or any placeholder standing in for them makes it a letter template instead of stationery — and the emptiness is the entire product.',
    must: ['businessName'],
    nice: ['logo', 'contact', 'address', 'phone', 'email', 'socials', 'website', 'colours', 'tagline'],
    rules: [
      'Identity at the top, contact strip at the foot, empty middle.',
      'Print only details that actually exist. A letterhead missing a phone number is correct; an invented one is not.'
    ],
    build: [
      'Top of the page: the business name, and at most two supporting lines.',
      'The middle: nothing at all.',
      'The foot: the contact strip, built only from details that actually exist.',
    ],
  },
  73: {
    purpose: 'The block under every email: who is writing, from where, and one or two ways to reply.',
    wrongWhen: 'It runs long or repeats the whole contact list. A signature is not a business card.',
    must: ['businessName', 'contact'],
    nice: ['personName', 'jobTitle', 'phone', 'email', 'website', 'logo', 'socials'],
    rules: ['At most six lines.', 'No marketing sentence, no quote, no disclaimer unless asked for.'],
    build: [
      'Name and role.',
      'The business name.',
      'One or two ways to reply.',
      'Nothing else — six lines in total.',
    ],
  },
  74: {
    purpose: 'What they sell and what each thing costs, scannable in a single look.',
    wrongWhen: 'Prices are missing, rounded, or invented — or each item has a paragraph instead of a line.',
    must: ['packages'],
    nice: ['businessName', 'logo', 'colours', 'contact'],
    rules: [
      'One line per item with its price on the same line.',
      'Figures exactly as supplied — never rounded, converted or invented.',
      'At most four groups.'
    ],
    build: [
      'Group the items into at most four sections, each with a heading.',
      'One line per item: the item, then its price, on the same line.',
      'Every figure exactly as supplied.',
      'A single contact line at the foot.',
    ],
  },
  75: {
    purpose: 'A card whose QR code opens the right destination when someone scans it.',
    wrongWhen: 'The destination is guessed. A QR code leading nowhere is worse than no QR code, because it is only found out in front of a customer.',
    must: ['targetUrl'],
    nice: ['businessName', 'logo', 'contact', 'colours'],
    rules: ['Encode the supplied link exactly, character for character.'],
    build: [
      'Encode the supplied link, character for character.',
      'The business name above the code.',
      'One line telling a person what scanning it gets them.',
    ],
  },
  76: {
    purpose: 'A table stand whose QR code opens the right destination when a seated customer scans it.',
    wrongWhen: 'The destination is guessed, or the code is too small or too low-contrast to scan from across a table.',
    must: ['targetUrl'],
    nice: ['businessName', 'logo', 'colours'],
    rules: ['Encode the supplied link exactly, character for character.'],
    build: [
      'Encode the supplied link, character for character.',
      'The business name above the code, readable across a table.',
      'One line telling a seated customer what scanning it gets them.',
    ],
  },
  77: {
    purpose: 'One page saying something is coming, and giving a way to be told when.',
    wrongWhen: 'There is nothing to do on it — no contact, no date, no follow-up route. Then it is a dead end with a logo.',
    must: ['businessName', 'contact'],
    nice: ['launchDate', 'logo', 'colours', 'socials', 'tagline'],
    rules: ['One headline, one line of copy, one way to follow up. Nothing else.'],
    build: [
      'A headline saying something is coming.',
      'One line on what it will be.',
      'The date, when one is supplied.',
      'One way to be told when it is live.',
    ],
  },

  // ---- 90s: Owner-only ------------------------------------------------
  90: {
    purpose: "Our analysis of a client's site: what is wrong, and what is worth fixing.",
    wrongWhen: 'The findings would apply to any website. Generic advice is not an audit.',
    must: ['website'],
    nice: [],
    rules: [
      'Every finding cites something actually present on that site.',
      'Every finding is paired with the specific fix and why it matters commercially.'
    ],
    build: [
      'Open with what the site is and what it appears to be for.',
      'Then the findings, each naming something actually present on that site.',
      'For each finding, the specific fix and what it is worth commercially.',
      'Close with the three things to do first.'
    ]
  }
};

export function specFor(sku: number | null | undefined): ProductSpec | null {
  return sku == null ? null : (SPECS[sku] ?? null);
}

/**
 * The spec as prompt text, in the order a person would explain the job:
 * what the thing is, what would ruin it, the rules it must satisfy, the steps
 * that build it, and finally the standing instruction about missing facts --
 * omit, never invent.
 */
export function specInstruction(spec: ProductSpec | null): string {
  if (!spec) return '';

  const parts = [`What this is: ${spec.purpose}`, `What would make it WRONG even if it looks good: ${spec.wrongWhen}`];
  if (spec.rules.length > 0) parts.push(`Rules you must obey: ${spec.rules.join(' ')}`);
  if (spec.build.length > 0) {
    // Numbered, and in order, because "what to put where" is a sequence and
    // prose flattens it. Every live failure so far was a missing step here,
    // not a missing rule.
    parts.push(
      `How to build it, in this order: ${spec.build.map((step, index) => `${index + 1}. ${step}`).join(' ')}`
    );
  }
  if (spec.nice.length > 0) {
    parts.push(
      `Include these when they are supplied below: ${spec.nice.map((key) => FIELDS[key].label).join(', ')}. ` +
        'Anything not supplied is simply left out — never invent a detail, a figure, a contact or a placeholder ' +
        'standing in for one. A deliverable missing a fact is correct; one carrying an invented fact is not.'
    );
  }
  return parts.join(' ');
}
