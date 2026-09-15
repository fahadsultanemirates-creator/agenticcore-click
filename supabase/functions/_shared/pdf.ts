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
// on the page, so a 20px font on a 420px-wide page reads as genuinely
// 20px on a 420px-wide phone screen -- the actual fix for text that used
// to render tiny once an A4 page got squeezed into a phone's width. Each
// section is its own page (a "slide"), so a phone reader sees one full
// screen at a time instead of a shrunk, zoomed-out A4 sheet.
import { renderHtmlToPdf } from './htmlPdf.ts';

export interface DocSection {
  heading: string;
  body: string;
  // Defaults to the doc-level language -- lets one document mix English
  // and Urdu sections (the "both languages" legal-agreement case).
  language?: 'en' | 'ur';
}

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
  language?: 'en' | 'ur';
  // Accepted for backward compatibility with older callers -- every spec
  // renders with the one .click brand look regardless of this value.
  theme?: 'document' | 'deck';
}

// A generic modern phone's logical viewport -- wide/tall enough to be
// comfortably readable, narrow enough that a real phone shows one page
// edge-to-edge without pinch-zooming.
const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 900;

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
// .click site's palette, not an approximation of it.
const BRAND_CSS_VARS = `
  --void: #09090d; --surface: #151519; --surface-2: #1e1e24; --border: #2a2a32;
  --fg: #f6f5f2; --fg-muted: #a6a4b0; --fg-faint: #6d6b78;
  --yellow-400: #ffd400; --yellow-700: #a37c00;
`;

// Replicates the site's own .bg-noise texture (a fine dot grid) so PDF
// pages carry the same subtle texture as the live site instead of a flat
// slab of color.
const DOT_PATTERN = `background-image: radial-gradient(var(--fg) 0.6px, transparent 0.6px); background-size: 16px 16px;`;

function footer(index: number, total: number, brandLabel: string, rtl: boolean): string {
  return `
    <div class="footer" style="flex-direction:${rtl ? 'row-reverse' : 'row'};">
      <span class="wordmark">agenticcore<span class="wordmark-accent">.click</span></span>
      <span class="page-index">${brandLabel} · ${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
    </div>`;
}

function renderSection(section: DocSection, docLanguage: 'en' | 'ur', index: number, total: number, brandLabel: string): string {
  const lang = section.language ?? docLanguage;
  const rtl = lang === 'ur';
  const fontFamily = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif";
  return `
    <section class="page slide" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${fontFamily}; text-align:${rtl ? 'right' : 'left'};">
      <div class="slide-body">
        <div class="badge" style="${rtl ? 'margin-left:auto;' : ''}">${String(index).padStart(2, '0')}</div>
        <div class="rule" style="${rtl ? 'margin-left:auto;' : ''}"></div>
        <h2>${escapeHtml(section.heading)}</h2>
        <div class="body">${bodyToHtml(section.body)}</div>
      </div>
      ${footer(index, total, brandLabel, rtl)}
    </section>`;
}

export async function renderDocumentPdf(spec: DocSpec): Promise<Uint8Array> {
  const language = spec.language ?? 'en';
  const rtl = language === 'ur';
  const titleFont = rtl ? "'Noto Nastaliq Urdu', serif" : "'Fraunces', serif";
  const total = spec.sections.length + 1;
  const brandLabel = escapeHtml(spec.title.length > 28 ? spec.title.slice(0, 28) + '…' : spec.title);

  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
${FONT_LINK}
<style>
  :root { ${BRAND_CSS_VARS} }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--void); color: var(--fg); font-family: 'Inter', sans-serif; }

  .page {
    width: ${PAGE_WIDTH}px; min-height: ${PAGE_HEIGHT}px;
    padding: 40px 32px 24px; position: relative; overflow: hidden;
    display: flex; flex-direction: column;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .page::before { content: ''; position: absolute; inset: 0; ${DOT_PATTERN} opacity: 0.05; pointer-events: none; }

  /* Cover */
  .cover {
    justify-content: center;
    background: radial-gradient(120% 90% at 100% 0%, rgba(255,212,0,0.16), transparent 60%), var(--void);
  }
  .cover .eyebrow {
    font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--yellow-400); margin: 0 0 18px;
  }
  .cover h1 { font-family: ${titleFont}; font-weight: 700; font-size: 38px; line-height: 1.12; margin: 0 0 16px; color: var(--fg); }
  .cover p.subtitle { font-size: 17px; line-height: 1.5; color: var(--fg-muted); margin: 0; }
  .cover .accent-bar { width: 56px; height: 5px; background: var(--yellow-400); border-radius: 3px; margin: 0 0 22px; }
  .cover .cover-blob {
    position: absolute; width: 260px; height: 260px; border-radius: 50%;
    background: var(--yellow-400); opacity: 0.14; filter: blur(50px);
    bottom: -80px; ${rtl ? 'left' : 'right'}: -80px;
  }

  /* Section slides */
  .slide-body { flex: 1; }
  .badge {
    width: 40px; height: 40px; border-radius: 10px; background: var(--yellow-400);
    color: var(--void); font-family: 'Inter', sans-serif; font-weight: 700; font-size: 16px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  }
  .rule { width: 44px; height: 4px; background: var(--yellow-400); border-radius: 2px; margin-bottom: 18px; }
  h2 { font-family: ${titleFont}; font-weight: 700; font-size: 26px; line-height: 1.25; margin: 0 0 16px; color: var(--fg); }
  .body p { font-size: 17px; line-height: 1.7; color: var(--fg-muted); margin: 0 0 14px; }
  .body p:first-child { color: var(--fg); }

  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 14px; margin-top: 16px; border-top: 1px solid var(--border);
    font-family: 'Inter', sans-serif; font-size: 11px; color: var(--fg-faint);
  }
  .wordmark { font-weight: 600; letter-spacing: 0.02em; }
  .wordmark-accent { color: var(--yellow-400); }
  .page-index { letter-spacing: 0.04em; }
</style>
</head>
<body>
  <section class="page cover" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${titleFont};">
    <div class="cover-blob"></div>
    <p class="eyebrow" style="font-family:'Inter',sans-serif;">AgenticCore Click</p>
    <div class="accent-bar"></div>
    <h1>${escapeHtml(spec.title)}</h1>
    ${spec.subtitle ? `<p class="subtitle" style="font-family:'Inter',sans-serif;">${escapeHtml(spec.subtitle)}</p>` : ''}
    ${footer(1, total, brandLabel, rtl)}
  </section>
  ${spec.sections.map((s, i) => renderSection(s, language, i + 2, total, brandLabel)).join('')}
</body>
</html>`;

  return renderHtmlToPdf(html, { format: `${PAGE_WIDTH}x${PAGE_HEIGHT}` });
}
