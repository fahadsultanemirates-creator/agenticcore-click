import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

export interface DocSection {
  heading: string;
  body: string;
}

export interface DocSpec {
  title: string;
  subtitle?: string;
  sections: DocSection[];
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (words.length === 0) lines.push('');
  }
  return lines;
}

// Simple flowing single-column layout with automatic page breaks --
// enough for the invoices/contracts/one-pagers/brand-guide content these
// services produce; not a general-purpose typesetting engine.
export async function renderDocumentPdf(spec: DocSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const drawLines = (lines: string[], font: PDFFont, size: number, lineHeight: number, color = rgb(0.1, 0.1, 0.1)) => {
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= lineHeight;
    }
  };

  drawLines(wrapText(spec.title, boldFont, 22, CONTENT_WIDTH), boldFont, 22, 28);
  if (spec.subtitle) {
    y -= 4;
    drawLines(wrapText(spec.subtitle, bodyFont, 12, CONTENT_WIDTH), bodyFont, 12, 16, rgb(0.35, 0.35, 0.35));
  }
  y -= 16;

  for (const section of spec.sections) {
    ensureSpace(40);
    drawLines(wrapText(section.heading, boldFont, 14, CONTENT_WIDTH), boldFont, 14, 20);
    y -= 4;
    drawLines(wrapText(section.body, bodyFont, 11, CONTENT_WIDTH), bodyFont, 11, 15);
    y -= 14;
  }

  return pdf.save();
}
