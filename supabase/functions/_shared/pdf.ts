// Renders documents as real HTML/CSS, converted to PDF via PDFShift's
// Chromium rendering (see htmlPdf.ts) -- replaces an earlier pdf-lib
// version. pdf-lib's built-in fonts have zero Arabic-script shaping
// support (Urdu would render as disconnected, wrongly-shaped letters);
// a real browser lays out RTL/Urdu text correctly because it's just
// normal text layout, the same way any webpage does.
//
// Every PDF this produces (documents, brand-kit, reports, social copy
// packs) uses the agenticcore.click brand look -- the exact color tokens
// from src/index.css (--color-void/surface/fg/yellow-400/etc), not a
// generic light "business document" theme. The page itself is sized to a
// phone screen (not A4): PDFShift's `format` accepts "{width}x{height}"
// in CSS px, and Chromium's print-to-pdf maps that 1:1 to real CSS pixels
// on the page, so a font sized for a 430px-wide page reads as genuinely
// that size on a 430px-wide phone screen -- the fix for text that used
// to render tiny once an A4 page got squeezed into a phone's width. Each
// section is its own page (a "slide"), so a phone reader sees one full
// screen at a time instead of a shrunk, zoomed-out A4 sheet.
//
// These PDFs are a client-facing marketing artifact, not an internal
// report -- callers (worker-pdf, worker-business-report) generate real
// Grok images and pass them in as coverImageUrl/section.imageUrl so a
// deck actually looks designed instead of a plain heading+paragraph
// dump. This module only lays them out; it never calls Grok itself.
import { renderHtmlToPdf } from './htmlPdf.ts';

export interface DocSection {
  heading: string;
  body: string;
  // Defaults to the doc-level language -- lets one document mix English
  // and Urdu sections (the "both languages" legal-agreement case).
  language?: 'en' | 'ur';
  // A real generated image banner shown above the heading on this slide.
  imageUrl?: string;
}

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
  language?: 'en' | 'ur';
  // Accepted for backward compatibility with older callers -- every spec
  // renders with the one .click brand look regardless of this value.
  theme?: 'document' | 'deck';
  // A hero image for the cover page (top ~45% of the page, faded into
  // the void background so the title stays legible over it).
  coverImageUrl?: string;
  // 'report' (default, renderDocumentPdf): a multi-page .click-branded deck
  // -- pdf/documents/business-report/social-copy. 'asset' (renderBrandKitAsset):
  // a single clean page that IS the finished brand-kit deliverable itself
  // (letterhead, email signature, price list, ...) -- this is the CLIENT's
  // own artifact, not .click's marketing collateral, so it deliberately
  // carries none of the void/yellow report theme.
  kind?: 'report' | 'asset';
  // Real hex colors pulled from the client's own referenced website (see
  // worker-pdf's describeReferenceWebsiteBrand) -- applied as actual CSS in
  // renderBrandKitAsset, never as prose the content model would otherwise
  // have to (mis)describe in the page text itself.
  // logoUrl is what gets persisted between the generate and render phases;
  // logoDataUri is filled in just before rendering (see withInlinedLogo), so a
  // half-megabyte image never sits in tasks.payload.
  brand?: { primaryColor?: string; accentColor?: string; logoUrl?: string; logoDataUri?: string };
  // Set for stationery assets (the letterhead). When present the asset renders
  // as printed paper -- identity block at the top, contact strip at the foot,
  // and an EMPTY middle for the client's own letter -- instead of the usual
  // title/rule/body block. The empty middle is the product, so it is a
  // separate shape rather than a section whose body happens to be blank.
  // businessName is printed as the identity line in its own right rather than
  // being headerLines[0]: asked to order the block itself, the model led with
  // the tagline and the name vanished from the page entirely. On stationery
  // the name is the one thing that cannot be missing.
  stationery?: { businessName: string; headerLines: string[]; footerLines: string[] };
  // Whose brand a multi-page deck wears. The catalog has recorded this per
  // product from the start; the deck renderer simply never read it, so eight
  // client-branded products -- brochures, proposals, terms, service
  // agreements -- came back in the .click palette with "agenticcore.click"
  // stamped on every page footer. A client's own service agreement carrying
  // our wordmark is not a cosmetic problem.
  // Defaults to 'agenticcore' so specs persisted before this field existed
  // keep rendering exactly as they did.
  branding?: 'client' | 'agenticcore';
  // The small line above the cover title. Our own documents say "AgenticCore
  // Click"; a client's says what the document is ("Brochure"), because naming
  // ourselves on their marketing material is the whole problem.
  eyebrow?: string;
}

// A generic modern phone's logical viewport -- wide/tall enough for
// bold, presentation-scale type and a real image banner per slide,
// narrow enough that a real phone shows one page edge-to-edge without
// pinch-zooming.
const PAGE_WIDTH = 430;
const PAGE_HEIGHT = 932;

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@500;700&display=swap" rel="stylesheet">';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Body text may contain simple paragraph breaks -- turn blank lines into
// separate <p> tags rather than dumping one huge unbroken block.
function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

// The exact tokens from src/index.css's @theme block -- this IS the
// .click site's palette, not an approximation of it. Correct for our own
// analysis documents; wrong for anything a client puts their name on.
const HOUSE_CSS_VARS = `
  --void: #09090d; --surface: #151519; --surface-2: #1e1e24; --border: #2a2a32;
  --fg: #f6f5f2; --fg-muted: #a6a4b0; --fg-faint: #6d6b78;
  --yellow-400: #ffd400; --yellow-700: #a37c00; --heading: #f6f5f2;
`;

// The same token names in a light, print-friendly scheme, with the accent
// taken from the client's own site. Reusing the names means the whole deck
// template works unchanged -- only what the tokens resolve to differs.
function clientCssVars(brand: DocSpec['brand']): string {
  // One brand colour across headings, rules and badges. Using primary for
  // headings and accent for rules made a page look like two half-finished
  // designs -- a teal title over a green rule -- because a site's two colours
  // are rarely meant to sit a centimetre apart.
  const accent = brand?.primaryColor ?? brand?.accentColor ?? '#14161b';
  return `
  --void: #ffffff; --surface: #f6f7f9; --surface-2: #eef0f4; --border: #e2e5ea;
  --fg: #14161b; --fg-muted: #4a4e57; --fg-faint: #8b8f99;
  --yellow-400: ${accent}; --yellow-700: ${accent}; --heading: ${accent};
`;
}

// Replicates the site's own .bg-noise texture (a fine dot grid) so PDF
// pages carry the same subtle texture as the live site instead of a flat
// slab of color.
const DOT_PATTERN = `background-image: radial-gradient(var(--fg) 0.6px, transparent 0.6px); background-size: 16px 16px;`;

function footer(index: number, total: number, brandLabel: string, rtl: boolean, houseBrand: boolean): string {
  // Our wordmark belongs only on our own documents. On a client's brochure or
  // contract the page simply carries their title and the page number.
  const wordmark = houseBrand
    ? `<span class="wordmark">agenticcore<span class="wordmark-accent">.click</span></span>`
    : `<span class="wordmark"></span>`;
  return `
    <div class="footer" style="flex-direction:${rtl ? 'row-reverse' : 'row'};">
      ${wordmark}
      <span class="page-index">${brandLabel} · ${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
    </div>`;
}

// One page per topic means the type has to give way, not the text. These
// steps were chosen against real generated sections: a short one keeps the
// generous 19px setting, a long one tightens rather than spilling.
function slideFontSize(section: DocSection): { body: number; heading: number } {
  const length = section.body.length + section.heading.length;
  if (length <= 550) return { body: 19, heading: 32 };
  if (length <= 850) return { body: 17, heading: 28 };
  if (length <= 1200) return { body: 15, heading: 25 };
  if (length <= 1700) return { body: 13.5, heading: 22 };
  return { body: 12, heading: 20 };
}

function renderSection(section: DocSection, docLanguage: 'en' | 'ur', index: number, total: number, brandLabel: string, houseBrand: boolean): string {
  const lang = section.language ?? docLanguage;
  const rtl = lang === 'ur';
  const fontFamily = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif";
  const size = slideFontSize(section);
  return `
    <section class="page slide" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${fontFamily}; text-align:${rtl ? 'right' : 'left'}; --body-size:${size.body}px; --heading-size:${size.heading}px;">
      <div class="slide-body">
        ${section.imageUrl ? `<img class="slide-image" src="${escapeHtml(section.imageUrl)}" alt="" />` : ''}
        <div class="slide-text">
          <div class="badge" style="${rtl ? 'margin-left:auto;' : ''}">${String(index).padStart(2, '0')}</div>
          <div class="rule" style="${rtl ? 'margin-left:auto;' : ''}"></div>
          <h2>${escapeHtml(section.heading)}</h2>
          <div class="body">${bodyToHtml(section.body)}</div>
        </div>
      </div>
      ${footer(index, total, brandLabel, rtl, houseBrand)}
    </section>`;
}

export async function renderDocumentPdf(spec: DocSpec): Promise<Uint8Array> {
  const language = spec.language ?? 'en';
  const rtl = language === 'ur';
  const titleFont = rtl ? "'Noto Nastaliq Urdu', serif" : "'Fraunces', serif";
  const total = spec.sections.length + 1;
  const brandLabel = escapeHtml(spec.title.length > 28 ? spec.title.slice(0, 28) + '…' : spec.title);
  const hasHero = Boolean(spec.coverImageUrl);
  const houseBrand = (spec.branding ?? 'agenticcore') === 'agenticcore';

  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
${FONT_LINK}
<style>
  :root { ${houseBrand ? HOUSE_CSS_VARS : clientCssVars(spec.brand)} }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--void); color: var(--fg); font-family: 'Inter', sans-serif; }

  .page {
    /* Fixed, not min-height: a growable page silently flows onto the next
       one, which is how a single topic ended up split across two pages with
       its heading left behind. Body type is scaled to the section's length
       (see slideFontSize) so fitting is achieved by sizing rather than by
       clipping text that someone paid for. */
    width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px;
    padding: 44px 36px 26px; position: relative; overflow: hidden;
    display: flex; flex-direction: column;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .page::before { content: ''; position: absolute; inset: 0; ${DOT_PATTERN} opacity: 0.05; pointer-events: none; }

  /* Cover */
  .cover {
    justify-content: flex-end;
    background: ${hasHero ? 'var(--void)' : `radial-gradient(120% 90% at 100% 0%, ${houseBrand ? 'rgba(255,212,0,0.18)' : 'var(--surface)'}, transparent 60%), var(--void)`};
    padding-top: 0;
  }
  .cover-hero { position: absolute; top: 0; left: 0; width: 100%; height: 46%; object-fit: cover; }
  .cover-scrim {
    position: absolute; top: 0; left: 0; width: 100%; height: 58%;
    background: linear-gradient(to bottom, ${houseBrand ? 'rgba(9,9,13,0.15)' : 'rgba(255,255,255,0.15)'} 0%, var(--void) 92%);
  }
  .cover-content { position: relative; padding-top: ${hasHero ? '0' : '120px'}; }
  .cover .eyebrow {
    font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--yellow-400); margin: 0 0 20px;
  }
  .cover h1 { font-family: ${titleFont}; font-weight: 800; font-size: 46px; line-height: 1.08; margin: 0 0 18px; color: var(--heading); }
  .cover p.subtitle { font-size: 19px; line-height: 1.55; color: var(--fg-muted); margin: 0; }
  .cover .accent-bar { width: 64px; height: 6px; background: var(--yellow-400); border-radius: 3px; margin: 0 0 24px; }
  .cover .cover-blob {
    position: absolute; width: 280px; height: 280px; border-radius: 50%;
    background: var(--yellow-400); opacity: 0.14; filter: blur(55px);
    bottom: -90px; ${rtl ? 'left' : 'right'}: -90px;
  }

  /* Section slides -- the image is a flex-grow sibling of the text block,
     not a fixed-height banner, so it expands to soak up whatever room a
     short body leaves rather than the page ending in dead space. */
  .slide-body { flex: 1; display: flex; flex-direction: column; }
  .slide-image {
    width: 100%; flex: 1 1 160px; min-height: 160px; max-height: 460px; object-fit: cover;
    border-radius: 16px; margin-bottom: 24px; border: 1px solid var(--border);
  }
  .slide-text { flex: 0 0 auto; }
  .slide-body:not(:has(.slide-image)) .slide-text {
    flex: 1; display: flex; flex-direction: column; justify-content: center;
  }
  .badge {
    width: 46px; height: 46px; border-radius: 12px; background: var(--yellow-400);
    color: var(--void); font-family: 'Inter', sans-serif; font-weight: 800; font-size: 18px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
  }
  .rule { width: 48px; height: 5px; background: var(--yellow-400); border-radius: 3px; margin-bottom: 20px; }
  h2 { font-family: ${titleFont}; font-weight: 700; font-size: var(--heading-size, 32px); line-height: 1.2; margin: 0 0 18px; color: var(--heading); }
  .body p { font-size: var(--body-size, 19px); line-height: 1.6; color: var(--fg-muted); margin: 0 0 14px; }
  .body p:first-child { color: var(--fg); }

  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 16px; margin-top: 18px; border-top: 1px solid var(--border);
    font-family: 'Inter', sans-serif; font-size: 12px; color: var(--fg-faint);
  }
  .wordmark { font-weight: 700; letter-spacing: 0.02em; }
  .wordmark-accent { color: var(--yellow-400); }
  .page-index { letter-spacing: 0.04em; }
</style>
</head>
<body>
  <section class="page cover" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${titleFont};">
    ${hasHero ? `<img class="cover-hero" src="${escapeHtml(spec.coverImageUrl!)}" alt="" /><div class="cover-scrim"></div>` : '<div class="cover-blob"></div>'}
    <div class="cover-content">
      <p class="eyebrow" style="font-family:'Inter',sans-serif;">${escapeHtml(
        houseBrand ? 'AgenticCore Click' : (spec.eyebrow ?? '')
      )}</p>
      <div class="accent-bar"></div>
      <h1>${escapeHtml(spec.title)}</h1>
      ${spec.subtitle ? `<p class="subtitle" style="font-family:'Inter',sans-serif;">${escapeHtml(spec.subtitle)}</p>` : ''}
    </div>
    ${footer(1, total, brandLabel, rtl, houseBrand)}
  </section>
  ${spec.sections.map((s, i) => renderSection(s, language, i + 2, total, brandLabel, houseBrand)).join('')}
</body>
</html>`;

  return renderHtmlToPdf(html, { format: `${PAGE_WIDTH}x${PAGE_HEIGHT}` });
}

// A4-at-96dpi -- brand-kit assets are real print/use items (a letterhead,
// an email signature, a price list), so they get real print proportions
// instead of the phone-sized report deck above.
const ASSET_PAGE_WIDTH = 794;
const ASSET_PAGE_HEIGHT = 1123;

export async function renderBrandKitAsset(spec: DocSpec): Promise<Uint8Array> {
  if (spec.stationery) return renderStationery(spec);

  const section = spec.sections[0];
  const rtl = (section.language ?? spec.language) === 'ur';
  const fontFamily = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif";
  const titleColor = spec.brand?.primaryColor ?? '#14161b';
  const ruleColor = spec.brand?.accentColor ?? '#c7cad1';
  const logo = spec.brand?.logoDataUri;

  const html = `<!doctype html>
<html lang="${spec.language ?? 'en'}">
<head>
<meta charset="utf-8">
${FONT_LINK}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; color: #14161b; font-family: 'Inter', sans-serif; }
  .page {
    width: ${ASSET_PAGE_WIDTH}px; min-height: ${ASSET_PAGE_HEIGHT}px;
    padding: 64px 72px; display: flex; flex-direction: column;
  }
  .logo { max-height: 48px; max-width: 220px; margin: 0 0 20px; ${rtl ? 'align-self: flex-end;' : ''} }
  h1 {
    font-family: ${fontFamily}; font-weight: 700; font-size: 22px;
    margin: 0 0 14px; color: ${titleColor}; text-align: ${rtl ? 'right' : 'left'};
  }
  .rule {
    width: 56px; height: 3px; background: ${ruleColor}; border-radius: 2px;
    margin: 0 0 28px; ${rtl ? 'margin-left: auto;' : ''}
  }
  .body {
    font-family: ${fontFamily}; font-size: 14px; line-height: 1.7; color: #2b2d33;
    text-align: ${rtl ? 'right' : 'left'};
  }
  .body p { margin: 0 0 14px; }
</style>
</head>
<body>
  <section class="page" dir="${rtl ? 'rtl' : 'ltr'}">
    ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
    <h1>${escapeHtml(spec.title)}</h1>
    <div class="rule"></div>
    <div class="body">${bodyToHtml(section.body)}</div>
  </section>
</body>
</html>`;

  return renderHtmlToPdf(html, { format: `${ASSET_PAGE_WIDTH}x${ASSET_PAGE_HEIGHT}` });
}

// Printed paper: identity at the top, contact strip at the foot, nothing in
// between. The middle is empty on purpose -- it is where the client's own
// letter goes, and it is the reason the product exists.
async function renderStationery(spec: DocSpec): Promise<Uint8Array> {
  const rtl = spec.language === 'ur';
  const fontFamily = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif";
  const nameColor = spec.brand?.primaryColor ?? '#14161b';
  const ruleColor = spec.brand?.accentColor ?? '#c7cad1';
  const logo = spec.brand?.logoDataUri;

  const name = spec.stationery!.businessName.trim() || spec.title;
  // Anything that merely repeats the name adds a duplicate line to the block.
  const restHeader = spec.stationery!.headerLines
    .map((line) => line.trim())
    .filter((line) => line !== '' && line.toLowerCase() !== name.toLowerCase());
  const footer = spec.stationery!.footerLines.filter((line) => line.trim() !== '');

  const html = `<!doctype html>
<html lang="${spec.language ?? 'en'}">
<head>
<meta charset="utf-8">
${FONT_LINK}
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; color: #14161b; font-family: 'Inter', sans-serif; }
  .page {
    width: ${ASSET_PAGE_WIDTH}px; height: ${ASSET_PAGE_HEIGHT}px;
    padding: 56px 72px 44px; display: flex; flex-direction: column;
    text-align: ${rtl ? 'right' : 'left'};
  }
  .head { display: flex; align-items: center; gap: 18px; ${rtl ? 'flex-direction: row-reverse;' : ''} }
  /* Roomy enough that a wide wordmark stays readable at print size -- 56px
     tall reduced anything but a tight square icon to a smudge. */
  .logo { max-height: 76px; max-width: 280px; object-fit: contain; }
  .name { font-family: ${fontFamily}; font-weight: 700; font-size: 20px; color: ${nameColor}; margin: 0; }
  .sub { font-family: ${fontFamily}; font-size: 12px; color: #5a5e68; margin: 4px 0 0; line-height: 1.5; }
  .head-rule { height: 3px; background: ${ruleColor}; border-radius: 2px; margin: 18px 0 0; }
  /* The whole point of the product: untouched space for the client's letter. */
  .writing-area { flex: 1 1 auto; }
  .foot-rule { height: 1px; background: #e3e5ea; margin: 0 0 12px; }
  .foot {
    font-family: ${fontFamily}; font-size: 10.5px; line-height: 1.7; color: #5a5e68;
  }
  .foot div { margin: 0; }
</style>
</head>
<body>
  <section class="page" dir="${rtl ? 'rtl' : 'ltr'}">
    <header>
      <div class="head">
        ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
        <div>
          <p class="name">${escapeHtml(name)}</p>
          ${restHeader.map((line) => `<p class="sub">${escapeHtml(line)}</p>`).join('')}
        </div>
      </div>
      <div class="head-rule"></div>
    </header>

    <div class="writing-area"></div>

    <footer>
      <div class="foot-rule"></div>
      <div class="foot">${footer.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
    </footer>
  </section>
</body>
</html>`;

  return renderHtmlToPdf(html, { format: `${ASSET_PAGE_WIDTH}x${ASSET_PAGE_HEIGHT}` });
}
