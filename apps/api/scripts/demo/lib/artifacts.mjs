/**
 * Generación de ARTEFACTOS de relleno (ficticios) para que los documentos del expediente y del data
 * room tengan contenido real:
 *   · `pdfDoc(title, paragraphs)` → un PDF de una página con pdf-lib (válido → la marca de agua del
 *      data room y la descarga funcionan; pdf-lib es el mismo motor que usa el watermark de la API).
 *   · `textBlob(text)` → texto plano (mimeType text/plain) que la API sabe extraer para el REDLINE.
 *
 * Nada de esto contiene PII real: nombres y datos son inventados.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Reemplaza caracteres fuera de Latin-1 (WinAnsi de las StandardFonts) para no romper el PDF. */
function sanitize(s) {
  return String(s).replace(/[^\x00-\xFF]/g, '?');
}

/**
 * PDF de una página con cabecera y párrafos. Devuelve { bytes, mimeType, sizeBytes }.
 * @param {string} title
 * @param {string[]} paragraphs
 */
export async function pdfDoc(title, paragraphs) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitize(title));
  pdf.setProducer('LegalFlow · datos DEMO (ficticios)');
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 56;
  let y = height - margin;

  // Sello "DEMO" tenue arriba a la derecha.
  page.drawText('DEMO · DATOS FICTICIOS', {
    x: width - margin - 150,
    y: height - 30,
    size: 8,
    font: bold,
    color: rgb(0.7, 0.2, 0.2),
  });

  page.drawText(sanitize(title), { x: margin, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.2) });
  y -= 28;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });
  y -= 22;

  const maxWidth = width - margin * 2;
  const size = 11;
  const lineHeight = 16;
  for (const para of paragraphs) {
    const words = sanitize(para).split(/\s+/);
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.15) });
        y -= lineHeight;
        line = w;
        if (y < margin) break;
      } else {
        line = candidate;
      }
    }
    if (line && y >= margin) {
      page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.15) });
      y -= lineHeight;
    }
    y -= 8; // espacio entre párrafos
    if (y < margin) break;
  }

  const bytes = await pdf.save();
  return { bytes, mimeType: 'application/pdf', sizeBytes: bytes.length };
}

/** Texto plano para el redline (la API extrae el texto de text/plain). */
export function textBlob(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  return { bytes, mimeType: 'text/plain', sizeBytes: bytes.length };
}
