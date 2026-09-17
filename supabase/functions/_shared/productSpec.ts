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
    ]
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
    ]
  },
  22: {
    purpose: 'A card handed to a person: who they are and how to reach them.',
    wrongWhen: 'It carries marketing copy. A business card is contact details, not a pitch.',
    must: ['businessName', 'contact'],
    nice: ['personName', 'jobTitle', 'logo', 'address', 'socials', 'website', 'colours'],
    rules: ['No sentences and no body copy — short labelled lines only.', 'At most eight lines in total.']
  },
  23: {
    purpose: 'One page that makes a passer-by do something.',
    wrongWhen: 'It is a wall of text, or nothing on it tells the reader what to do next.',
    must: ['contact'],
    nice: ['businessName', 'logo', 'colours', 'packages', 'address', 'socials'],
    rules: ['One headline, one offer, one instruction.', 'Short lines. Nothing a reader has to study.']
  },
  24: {
    purpose: 'Read from several metres away: a name, one line, a way to find them.',
    wrongWhen: 'It contains anything unreadable at a distance — paragraphs, small print, long lists.',
    must: ['businessName'],
    nice: ['logo', 'tagline', 'contact', 'website', 'colours'],
    rules: ['At most twelve words besides the contact line.', 'No body copy of any kind.']
  },
  25: {
    purpose: 'Whatever document the brief names — the brief decides the shape.',
    wrongWhen: 'It invents a structure the brief never asked for, or pads to fill pages.',
    must: ['topic'],
    nice: ['businessName', 'logo', 'colours', 'contact'],
    rules: ['Follow the brief exactly. Use only as many sections as it genuinely needs.']
  },

  // ---- 50s: Social ---------------------------------------------------
  50: {
    purpose: 'Ready-to-post graphics, each readable in a feed at thumbnail size.',
    wrongWhen: 'The text is too small or too long to read while scrolling, or the crop is wrong for the platform.',
    must: ['topic'],
    nice: ['businessName', 'logo', 'colours'],
    rules: ['Square 1:1 unless the brief names a platform that wants otherwise.', 'At most ten words on the image.']
  },
  51: {
    purpose: "A profile picture and cover that fit the platform's exact crops.",
    wrongWhen: 'The logo or face is cut off by the circular profile crop, or the cover centre is obscured by overlaid UI.',
    must: ['businessName'],
    nice: ['logo', 'colours'],
    rules: [
      'The profile image is square with everything important inside the safe circle.',
      'The cover is wide with its centre kept clear.'
    ]
  },
  52: {
    purpose: 'Copy the client pastes straight into posts: captions with matching hashtags.',
    wrongWhen: 'It reads like an article, or the hashtags are generic instead of being about their business and their place.',
    must: ['topic'],
    nice: ['businessName', 'services', 'address', 'socials', 'website'],
    rules: ['Each caption at most forty words.', 'Hashtags grouped under their own caption, not scattered through it.']
  },
  53: {
    purpose: 'The exact fields Google Business Profile asks for: description, services, posts, questions.',
    wrongWhen: 'It is free-form marketing copy instead of the named fields, or it exceeds the limits Google enforces.',
    must: ['businessName', 'services'],
    nice: ['address', 'phone', 'website', 'packages'],
    rules: [
      'Label every block with the Google field it is pasted into.',
      'The business description is at most 750 characters.'
    ]
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
    ]
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
    ]
  },
  62: {
    purpose: 'One page a reader can decide from: what the business does, for whom, and how it makes money.',
    wrongWhen: 'It describes the business instead of planning it — no numbers, no model, nothing to decide on.',
    must: ['businessName', 'services'],
    nice: ['packages', 'audience', 'website', 'colours'],
    rules: [
      'Include how revenue is actually made — what is sold and at what price — using only figures that were supplied.',
      'Every line earns its place. One page means one page.'
    ]
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
    ]
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
    ]
  },

  // ---- 70s: Brand & marketing kit ------------------------------------
  70: {
    purpose: 'A short list of usable business names, each with a tagline, to choose between.',
    wrongWhen: 'It offers one option, or the names are interchangeable word-salad that says nothing about the business.',
    must: ['topic'],
    nice: ['audience', 'colours'],
    rules: ['Between six and ten options.', 'Each option is a name plus exactly one tagline. Nothing else on the page.']
  },
  71: {
    purpose: 'The rules someone needs to use this brand correctly: colours with codes, type, logo use.',
    wrongWhen: 'It describes the brand in prose instead of giving the actual usable values.',
    must: ['businessName', 'colours'],
    nice: ['logo', 'tagline', 'fonts'],
    rules: ['Colours as hex codes, not names.', 'State rules as do and do-not, never as paragraphs.']
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
    ]
  },
  73: {
    purpose: 'The block under every email: who is writing, from where, and one or two ways to reply.',
    wrongWhen: 'It runs long or repeats the whole contact list. A signature is not a business card.',
    must: ['businessName', 'contact'],
    nice: ['personName', 'jobTitle', 'phone', 'email', 'website', 'logo', 'socials'],
    rules: ['At most six lines.', 'No marketing sentence, no quote, no disclaimer unless asked for.']
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
    ]
  },
  75: {
    purpose: 'A card whose QR code opens the right destination when someone scans it.',
    wrongWhen: 'The destination is guessed. A QR code leading nowhere is worse than no QR code, because it is only found out in front of a customer.',
    must: ['targetUrl'],
    nice: ['businessName', 'logo', 'contact', 'colours'],
    rules: ['Encode the supplied link exactly, character for character.']
  },
  76: {
    purpose: 'A table stand whose QR code opens the right destination when a seated customer scans it.',
    wrongWhen: 'The destination is guessed, or the code is too small or too low-contrast to scan from across a table.',
    must: ['targetUrl'],
    nice: ['businessName', 'logo', 'colours'],
    rules: ['Encode the supplied link exactly, character for character.']
  },
  77: {
    purpose: 'One page saying something is coming, and giving a way to be told when.',
    wrongWhen: 'There is nothing to do on it — no contact, no date, no follow-up route. Then it is a dead end with a logo.',
    must: ['businessName', 'contact'],
    nice: ['launchDate', 'logo', 'colours', 'socials', 'tagline'],
    rules: ['One headline, one line of copy, one way to follow up. Nothing else.']
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
    ]
  }
};

export function specFor(sku: number | null | undefined): ProductSpec | null {
  return sku == null ? null : (SPECS[sku] ?? null);
}

/**
 * The spec as prompt text. Purpose and failure mode first, because knowing
 * what would make the thing wrong is what stops a polished-but-useless
 * deliverable; then the hard rules; then the standing instruction about
 * missing facts, which is the same everywhere: omit, never invent.
 */
export function specInstruction(spec: ProductSpec | null): string {
  if (!spec) return '';

  const parts = [`What this is: ${spec.purpose}`, `What would make it WRONG even if it looks good: ${spec.wrongWhen}`];
  if (spec.rules.length > 0) parts.push(`Rules you must obey: ${spec.rules.join(' ')}`);
  if (spec.nice.length > 0) {
    parts.push(
      `Include these when they are supplied below: ${spec.nice.map((key) => FIELDS[key].label).join(', ')}. ` +
        'Anything not supplied is simply left out — never invent a detail, a figure, a contact or a placeholder ' +
        'standing in for one. A deliverable missing a fact is correct; one carrying an invented fact is not.'
    );
  }
  return parts.join(' ');
}
