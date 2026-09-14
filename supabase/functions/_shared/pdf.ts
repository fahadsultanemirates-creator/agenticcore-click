// Renders documents as real HTML/CSS, converted to PDF via PDFShift's
// Chromium rendering (see htmlPdf.ts) -- replaces an earlier pdf-lib
// version. pdf-lib's built-in fonts have zero Arabic-script shaping
// support (Urdu would render as disconnected, wrongly-shaped letters);
// a real browser lays out RTL/Urdu text correctly because it's just
// normal text layout, the same way any webpage does. This also gives
// real design control -- brand colors, big mobile-legible type, one
// section per page -- that hand-drawing text with pdf-lib never had.

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
  // 'document': light, formal, printable (contracts, invoices, one-pagers).
  // 'deck': dark, .click-branded slide style (the business report).
  theme?: 'document' | 'deck';
}

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600&family=Noto+Nastaliq+Urdu:wght@500;700&display=swap" rel="stylesheet">';

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

function themeVars(theme: 'document' | 'deck'): string {
  if (theme === 'deck') {
    return `
      --bg: #09090d; --panel: #151519; --fg: #f6f5f2; --fg-muted: #a6a4b0;
      --accent: #ffd400; --rule: #2a2a32;
    `;
  }
  return `
    --bg: #ffffff; --panel: #fafafa; --fg: #171717; --fg-muted: #55555c;
    --accent: #a37c00; --rule: #e4e4e7;
  `;
}

function renderSection(section: DocSection, docLanguage: 'en' | 'ur'): string {
  const lang = section.language ?? docLanguage;
  const rtl = lang === 'ur';
  const fontFamily = rtl ? "'Noto Nastaliq Urdu', serif" : "'Inter', sans-serif";
  return `
    <section class="page" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${fontFamily}; text-align:${rtl ? 'right' : 'left'};">
      <div class="rule"></div>
      <h2>${escapeHtml(section.heading)}</h2>
      <div class="body">${bodyToHtml(section.body)}</div>
    </section>`;
}

export async function renderDocumentPdf(spec: DocSpec): Promise<Uint8Array> {
  const language = spec.language ?? 'en';
  const theme = spec.theme ?? 'document';
  const rtl = language === 'ur';
  const titleFont = rtl ? "'Noto Nastaliq Urdu', serif" : "'Fraunces', serif";

  const html = `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
${FONT_LINK}
<style>
  :root { ${themeVars(theme)} }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: 'Inter', sans-serif; }
  .page { padding: 56px 48px; min-height: 90vh; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; justify-content: center; align-items: ${rtl ? 'flex-end' : 'flex-start'}; }
  .cover h1 { font-family: ${titleFont}; font-size: 40px; line-height: 1.15; margin: 0 0 16px; color: var(--fg); }
  .cover p { font-size: 18px; color: var(--fg-muted); margin: 0; }
  .rule { width: 64px; height: 4px; background: var(--accent); margin-bottom: 20px; }
  h2 { font-family: 'Fraunces', serif; font-size: 26px; line-height: 1.25; margin: 0 0 18px; color: var(--fg); }
  .body p { font-size: 17px; line-height: 1.65; color: var(--fg); margin: 0 0 14px; }
  .body { color: var(--fg); }
</style>
</head>
<body>
  <section class="page cover" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:${titleFont};">
    <h1>${escapeHtml(spec.title)}</h1>
    ${spec.subtitle ? `<p>${escapeHtml(spec.subtitle)}</p>` : ''}
  </section>
  ${spec.sections.map((s) => renderSection(s, language)).join('')}
</body>
</html>`;

  return renderHtmlToPdf(html, { format: 'A4' });
}
