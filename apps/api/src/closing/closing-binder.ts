import PDFDocument from 'pdfkit';
import {
  drawBrandFooter,
  drawBrandHeader,
  PDF_BRAND,
  PDF_HAIRLINE,
  PDF_INK,
  PDF_MARGIN,
  PDF_MUTED,
} from '../common/pdf-brand';

// Uniones de strings locales (equivalentes a los enums de dominio/Prisma) para desacoplar el
// renderizado del binder del tipo concreto: tanto la salida de Prisma como el enum de dominio asignan.
type ClosingItemCategory = 'CONDITION_PRECEDENT' | 'DELIVERABLE' | 'SIGNATURE_PAGE' | 'OTHER';
type ClosingItemStatus = 'PENDING' | 'IN_PROGRESS' | 'WAIVED' | 'SATISFIED';
type ClosingItemPhase = 'AT_SIGNING' | 'AT_CLOSING' | 'POST_CLOSING';

export interface BinderItem {
  title: string;
  detail?: string | null;
  status: ClosingItemStatus;
  phase?: ClosingItemPhase | null;
  /** Hoja de firmas retenida en depósito (escrow) hasta el cierre. */
  inEscrow?: boolean | null;
  releasedAt?: Date | null;
  responsibleParty?: string | null;
  assigneeName?: string | null;
  dueDate?: Date | null;
  documentName?: string | null;
  /** Nombre del fichero incluido en el ZIP del binder (si la partida tiene documento). */
  bundledFileName?: string | null;
}

export interface BinderGroup {
  category: ClosingItemCategory;
  items: BinderItem[];
}

export interface ClosingBinderData {
  firmName: string;
  firmTaxId?: string | null;
  matterReference: string;
  matterTitle: string;
  checklistTitle: string;
  signingDate: Date | null;
  closingDate: Date | null;
  longstopDate: Date | null;
  generatedAt: Date;
  groups: BinderGroup[];
}

const CATEGORY_LABEL: Record<ClosingItemCategory, string> = {
  CONDITION_PRECEDENT: 'Condiciones previas',
  DELIVERABLE: 'Entregables',
  SIGNATURE_PAGE: 'Hojas de firma',
  OTHER: 'Otros',
};

const STATUS_LABEL: Record<ClosingItemStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  WAIVED: 'Dispensada',
  SATISFIED: 'Cumplida',
};

const PHASE_LABEL: Record<ClosingItemPhase, string> = {
  AT_SIGNING: 'A la firma',
  AT_CLOSING: 'Al cierre',
  POST_CLOSING: 'Post-cierre',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Índice del closing binder: portada con el expediente y la fecha de cierre, y las partidas agrupadas
 * por naturaleza (condiciones previas / entregables / hojas de firma) con su estado, parte responsable,
 * vencimiento y el documento vinculado. Mismo lenguaje visual que facturas y documentos.
 */
export function buildClosingBinderIndex(data: ClosingBinderData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PDF_MARGIN;
    const right = doc.page.width - PDF_MARGIN;
    const width = right - left;

    let y = drawBrandHeader(doc, {
      firmName: data.firmName,
      firmTaxId: data.firmTaxId,
      label: 'Closing binder',
      sublabel: `Generado el ${formatDate(data.generatedAt)}`,
    });

    doc.fillColor(PDF_INK).font('Helvetica-Bold').fontSize(16).text(data.checklistTitle, left, y, {
      width,
    });
    y = doc.y + 4;
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(`${data.matterReference} · ${data.matterTitle}`, left, y, { width });
    y = doc.y + 2;
    const calendar: string[] = [];
    if (data.signingDate) calendar.push(`Firma: ${formatDate(data.signingDate)}`);
    if (data.closingDate) calendar.push(`Cierre: ${formatDate(data.closingDate)}`);
    if (data.longstopDate) calendar.push(`Longstop: ${formatDate(data.longstopDate)}`);
    if (calendar.length > 0) {
      doc
        .fillColor(PDF_MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text(calendar.join('   ·   '), left, y, { width });
      y = doc.y;
    }
    y += 14;

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - PDF_MARGIN - 24) {
        doc.addPage();
        y = PDF_MARGIN;
      }
    };

    for (const group of data.groups) {
      if (group.items.length === 0) continue;
      ensureSpace(40);
      // Cabecera de grupo.
      doc
        .fillColor(PDF_BRAND)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`${CATEGORY_LABEL[group.category]} (${group.items.length})`, left, y, { width });
      y = doc.y + 4;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_HAIRLINE).stroke();
      y += 8;

      group.items.forEach((item, idx) => {
        ensureSpace(46);
        const mark = item.status === 'SATISFIED' ? '☑' : item.status === 'WAIVED' ? '⊘' : '☐';
        doc
          .fillColor(PDF_INK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(`${mark}  ${idx + 1}. ${item.title}`, left, y, { width });
        y = doc.y + 1;

        const meta: string[] = [`Estado: ${STATUS_LABEL[item.status]}`];
        if (item.phase) meta.push(`Fase: ${PHASE_LABEL[item.phase]}`);
        if (item.inEscrow) meta.push('En depósito (escrow)');
        else if (item.releasedAt) meta.push(`Liberada: ${formatDate(item.releasedAt)}`);
        if (item.responsibleParty) meta.push(`Responsable: ${item.responsibleParty}`);
        if (item.assigneeName) meta.push(`Asignado a: ${item.assigneeName}`);
        if (item.dueDate) meta.push(`Vence: ${formatDate(item.dueDate)}`);
        doc
          .fillColor(PDF_MUTED)
          .font('Helvetica')
          .fontSize(8.5)
          .text(meta.join('   ·   '), left + 16, y, { width: width - 16 });
        y = doc.y + 1;

        if (item.detail) {
          doc
            .fillColor(PDF_INK)
            .font('Helvetica')
            .fontSize(9)
            .text(item.detail, left + 16, y, { width: width - 16 });
          y = doc.y + 1;
        }
        if (item.documentName) {
          const docLine = item.bundledFileName
            ? `Documento: ${item.documentName}  →  ${item.bundledFileName}`
            : `Documento: ${item.documentName}`;
          doc
            .fillColor(PDF_BRAND)
            .font('Helvetica-Oblique')
            .fontSize(8.5)
            .text(docLine, left + 16, y, { width: width - 16 });
          y = doc.y + 1;
        }
        y += 7;
      });
      y += 6;
    }

    drawBrandFooter(doc, {
      note: `Closing binder · ${data.firmName} · ${data.matterReference}`,
    });
    doc.end();
  });
}
