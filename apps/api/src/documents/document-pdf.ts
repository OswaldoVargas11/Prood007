import PDFDocument from 'pdfkit';
import {
  drawBrandFooter,
  drawBrandHeader,
  PDF_INK,
  PDF_MARGIN,
  PDF_MUTED,
} from '../common/pdf-brand';

export interface DocumentPdfData {
  firmName: string;
  firmTaxId?: string | null;
  /** Título del documento (nombre de la plantilla o el que ponga el usuario). */
  title: string;
  /** Cuerpo YA renderizado (marcadores sustituidos), en texto plano con saltos de línea. */
  bodyText: string;
  generatedAt: Date;
}

/**
 * PDF bonito de un documento generado desde plantilla: membrete del despacho, título, cuerpo en
 * párrafos con tipografía legible (justificado) y pie de marca. Mismo lenguaje visual que las facturas.
 */
export function buildDocumentPdf(data: DocumentPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PDF_MARGIN;
    const right = doc.page.width - PDF_MARGIN;
    const width = right - left;
    const dateLong = data.generatedAt.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const startY = drawBrandHeader(doc, {
      firmName: data.firmName,
      firmTaxId: data.firmTaxId,
      label: 'Documento',
      sublabel: dateLong,
    });

    // Título del documento.
    doc.fillColor(PDF_INK).font('Helvetica-Bold').fontSize(16).text(data.title, left, startY, {
      width,
    });

    // Cuerpo: párrafos separados por líneas en blanco; justificado y con interlineado cómodo.
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(11).fillColor(PDF_INK);
    const paragraphs = data.bodyText.replace(/\r\n/g, '\n').split(/\n{2,}/);
    for (const p of paragraphs) {
      const text = p.replace(/\n/g, ' ').trim();
      if (!text) {
        doc.moveDown(0.6);
        continue;
      }
      doc.text(text, { width, align: 'justify', lineGap: 4 });
      doc.moveDown(0.7);
    }

    drawBrandFooter(doc, {
      note: `${data.firmName} · Generado el ${dateLong}`,
    });
    doc.fillColor(PDF_MUTED); // no-op final por consistencia
    doc.end();
  });
}
