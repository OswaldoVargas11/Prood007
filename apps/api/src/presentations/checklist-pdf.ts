import PDFDocument from 'pdfkit';
import {
  drawBrandFooter,
  drawBrandHeader,
  PDF_INK,
  PDF_MARGIN,
  PDF_MUTED,
} from '../common/pdf-brand';

export interface ChecklistPdfItem {
  name: string;
  description?: string | null;
  required: boolean;
  status: 'PENDING' | 'UPLOADED' | 'NA';
}

export interface ChecklistPdfData {
  firmName: string;
  firmTaxId?: string | null;
  matterReference: string;
  matterTitle: string;
  clientName?: string | null;
  title: string;
  items: ChecklistPdfItem[];
  progress: { done: number; total: number; percent: number };
  generatedAt: Date;
}

const STATUS_LABEL: Record<ChecklistPdfItem['status'], string> = {
  UPLOADED: 'Aportado',
  PENDING: 'Pendiente',
  NA: 'No aplica',
};

/**
 * PDF del estado de una checklist de presentación: qué documentos se han aportado y cuáles faltan.
 * Mismo lenguaje visual (membrete + pie de marca) que las facturas y los documentos generados.
 */
export function buildChecklistPdf(data: ChecklistPdfData): Promise<Buffer> {
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
      label: 'Checklist de presentación',
      sublabel: dateLong,
    });

    // Título de la checklist + datos del expediente.
    doc.fillColor(PDF_INK).font('Helvetica-Bold').fontSize(16).text(data.title, left, startY, {
      width,
    });
    doc.moveDown(0.3);
    const meta = [
      `Expediente ${data.matterReference} — ${data.matterTitle}`,
      data.clientName ? `Cliente: ${data.clientName}` : null,
      `Progreso: ${data.progress.done}/${data.progress.total} aportados (${data.progress.percent}%)`,
    ]
      .filter(Boolean)
      .join('\n');
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text(meta, { width, lineGap: 2 });

    doc.moveDown(0.9);

    // Lista de requisitos: estado a la izquierda, nombre a la derecha.
    for (const item of data.items) {
      // Salto de página si no cabe la fila.
      if (doc.y > doc.page.height - PDF_MARGIN - 60) doc.addPage();
      const rowY = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(PDF_MUTED)
        .text(STATUS_LABEL[item.status].toUpperCase(), left, rowY, { width: 80 });
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(PDF_INK)
        .text(`${item.name}${item.required ? '' : ' (opcional)'}`, left + 90, rowY, {
          width: width - 90,
        });
      if (item.description) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(PDF_MUTED)
          .text(item.description, left + 90, doc.y, { width: width - 90, lineGap: 1 });
      }
      doc.moveDown(0.6);
    }

    drawBrandFooter(doc, { note: `${data.firmName} · Generado el ${dateLong}` });
    doc.end();
  });
}
