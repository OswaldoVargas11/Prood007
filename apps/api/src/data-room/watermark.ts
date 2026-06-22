import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Estampa una marca de agua diagonal y un pie en cada página de un PDF (email del visor + fecha) para
 * el data room: deja rastro de quién descargó qué. Si el buffer no es un PDF válido, devuelve el
 * original sin tocar (el llamador decide si entregar otros formatos sin marca).
 */
export async function watermarkPdf(buffer: Buffer, label: string): Promise<Buffer> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    return buffer;
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();
    // Marca diagonal central, tenue.
    page.drawText(label, {
      x: width * 0.12,
      y: height * 0.42,
      size: 28,
      font,
      color: rgb(0.6, 0.6, 0.65),
      opacity: 0.18,
      rotate: degrees(35),
    });
    // Pie inferior con etiqueta legible.
    page.drawText(label, {
      x: 24,
      y: 14,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.5),
      opacity: 0.7,
    });
  }
  const out = await pdf.save();
  return Buffer.from(out);
}
