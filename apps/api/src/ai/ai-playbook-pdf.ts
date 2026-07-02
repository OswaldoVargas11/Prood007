import PDFDocument from 'pdfkit';
import {
  drawBrandFooter,
  drawBrandHeader,
  PDF_BRAND,
  PDF_INK,
  PDF_MARGIN,
  PDF_MUTED,
} from '../common/pdf-brand';

export interface PlaybookPdfFinding {
  topic: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  preferredText?: string | null;
  status: 'PENDING' | 'DONE' | 'FAILED' | string;
  outcome?: 'COMPLIANT' | 'DEVIATION' | 'MISSING' | string | null;
  dealBreaker: boolean;
  analysis?: string | null;
  confidence?: string | null;
  snippet?: string | null;
  error?: string | null;
}

export interface PlaybookReviewPdfData {
  firmName: string;
  firmTaxId?: string | null;
  playbookName: string;
  documentName: string;
  matterReference: string;
  matterTitle: string;
  generatedAt: Date;
  findings: PlaybookPdfFinding[];
}

const OUTCOME_LABEL: Record<string, string> = {
  COMPLIANT: 'Cumple',
  DEVIATION: 'Desviación',
  MISSING: 'Ausente',
};

const SEVERITY_LABEL: Record<string, string> = {
  LOW: 'baja',
  MEDIUM: 'media',
  HIGH: 'alta',
};

/** Color del veredicto (verde/ámbar/gris); los deal-breakers van en rojo. */
function outcomeColor(f: PlaybookPdfFinding): string {
  if (f.dealBreaker) return '#b91c1c';
  if (f.outcome === 'COMPLIANT') return '#15803d';
  if (f.outcome === 'DEVIATION') return '#b45309';
  return PDF_MUTED;
}

/**
 * Informe PDF de una revisión de playbook: resumen de veredictos + un bloque por regla con el veredicto,
 * el análisis, la CITA literal del contrato y la redacción alternativa sugerida (posición preferida).
 * Mismo lenguaje visual (membrete + pie de marca) que el resto de PDFs del sistema.
 */
export function buildPlaybookReviewPdf(data: PlaybookReviewPdfData): Promise<Buffer> {
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
      label: 'Revisión de contrato',
      sublabel: dateLong,
    });

    // Cabecera del informe.
    doc
      .fillColor(PDF_INK)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(data.documentName, left, startY, { width });
    doc.moveDown(0.3);
    const done = data.findings.filter((f) => f.status === 'DONE');
    const deviations = done.filter((f) => f.outcome === 'DEVIATION');
    const dealBreakers = deviations.filter((f) => f.dealBreaker);
    const summary = [
      `Playbook: ${data.playbookName}`,
      `Expediente ${data.matterReference} — ${data.matterTitle}`,
      `Resultado: ${done.filter((f) => f.outcome === 'COMPLIANT').length} cumplen · ` +
        `${deviations.length} desviaciones (${dealBreakers.length} inaceptables) · ` +
        `${done.filter((f) => f.outcome === 'MISSING').length} ausentes · ` +
        `${data.findings.filter((f) => f.status !== 'DONE').length} sin resolver`,
    ].join('\n');
    doc.font('Helvetica').fontSize(10).fillColor(PDF_MUTED).text(summary, { width, lineGap: 2 });
    doc.moveDown(0.9);

    // Un bloque por regla.
    for (const f of data.findings) {
      if (doc.y > doc.page.height - PDF_MARGIN - 120) doc.addPage();

      const rowY = doc.y;
      const verdict =
        f.status === 'DONE'
          ? `${OUTCOME_LABEL[f.outcome ?? ''] ?? f.outcome ?? ''}${f.dealBreaker ? ' · INACEPTABLE' : ''}`
          : f.status === 'FAILED'
            ? 'Error'
            : 'Pendiente';
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(outcomeColor(f))
        .text(verdict.toUpperCase(), left, rowY + 2, { width: 95 });
      doc
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(PDF_INK)
        .text(f.topic, left + 105, rowY, { width: width - 105 });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(PDF_MUTED)
        .text(
          `Severidad ${SEVERITY_LABEL[f.severity] ?? f.severity}` +
            (f.confidence ? ` · confianza ${f.confidence}` : ''),
          left + 105,
          doc.y + 1,
          { width: width - 105 },
        );

      if (f.analysis) {
        doc.moveDown(0.35);
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor(PDF_INK)
          .text(f.analysis, left + 105, doc.y, { width: width - 105, lineGap: 1.5 });
      }
      if (f.snippet) {
        doc.moveDown(0.35);
        doc
          .font('Helvetica-Oblique')
          .fontSize(8.5)
          .fillColor(PDF_MUTED)
          .text(`«${truncate(f.snippet, 700)}»`, left + 105, doc.y, {
            width: width - 105,
            lineGap: 1.5,
          });
      }
      if (f.status === 'DONE' && f.outcome !== 'COMPLIANT' && f.preferredText) {
        doc.moveDown(0.35);
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(PDF_BRAND)
          .text('Redacción sugerida (posición del despacho):', left + 105, doc.y, {
            width: width - 105,
          });
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(PDF_INK)
          .text(truncate(f.preferredText, 1200), left + 105, doc.y + 1, {
            width: width - 105,
            lineGap: 1.5,
          });
      }
      if (f.status === 'FAILED' && f.error) {
        doc.moveDown(0.35);
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(PDF_MUTED)
          .text(`No se pudo resolver (${f.error}); relanza la revisión.`, left + 105, doc.y, {
            width: width - 105,
          });
      }
      doc.moveDown(0.9);
    }

    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PDF_MUTED)
      .text(
        'Informe generado con IA sobre el texto del documento; las citas están verificadas contra el ' +
          'texto extraído. Revisión profesional del letrado imprescindible antes de actuar.',
        left,
        doc.y,
        { width, lineGap: 1.5 },
      );

    drawBrandFooter(doc, { note: `${data.firmName} · Generado el ${dateLong}` });
    doc.end();
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
