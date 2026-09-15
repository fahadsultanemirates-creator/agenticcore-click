// Wraps PDFShift (Chromium-based rendering, confirmed via its own docs):
// real browser text layout, so Arabic/Urdu shapes correctly (pdf-lib's
// built-in fonts can't do that at all) and normal CSS gives real design
// control -- brand colors, big mobile-friendly type, one section per page.

const PDFSHIFT_API_KEY = Deno.env.get('PDFSHIFT_API_KEY')!;
const PDFSHIFT_API = 'https://api.pdfshift.io/v3';

export async function renderHtmlToPdf(html: string, opts: { format?: string; landscape?: boolean } = {}): Promise<Uint8Array> {
  const resp = await fetch(`${PDFSHIFT_API}/convert/pdf`, {
    method: 'POST',
    headers: { 'X-API-Key': PDFSHIFT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: html,
      format: opts.format ?? 'A4',
      landscape: opts.landscape ?? false,
      margin: '0'
    })
  });
  if (!resp.ok) {
    throw new Error(`PDFShift PDF conversion failed (${resp.status}): ${await resp.text()}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

// Screenshots a live URL (not HTML we authored) -- used for the business
// report's visual review. viewport "375x812" gives a phone-sized render,
// "1440x900" a desktop one; fullpage captures the whole scrollable page.
export async function screenshotUrl(url: string, viewport: string, fullpage = true): Promise<Uint8Array> {
  const resp = await fetch(`${PDFSHIFT_API}/convert/png`, {
    method: 'POST',
    headers: { 'X-API-Key': PDFSHIFT_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: url, viewport, fullpage })
  });
  if (!resp.ok) {
    throw new Error(`PDFShift screenshot failed (${resp.status}): ${await resp.text()}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}
