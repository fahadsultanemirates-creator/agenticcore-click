import qrcodeFactory from 'https://esm.sh/qrcode-generator@1.4.4';

// Pure-JS QR generation (no canvas/native deps, so it runs fine in the
// Deno edge runtime) -- returns ready-to-serve SVG markup.
export function generateQrSvg(text: string): string {
  const qr = qrcodeFactory(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4 });
}
