import PDFDocument from 'pdfkit';
import {
  PDF_BRAND,
  PDF_HAIRLINE,
  PDF_INK,
  PDF_MARGIN,
  PDF_MUTED,
  drawBrandFooter,
  drawBrandHeader,
} from '../common/pdf-brand';
import type { FiscalReport, FiscalReportBlock } from './fiscal-reports.service';

export interface FiscalReportPdfData {
  firmName: string;
  firmTaxId: string | null;
  report: FiscalReport;
}

/** Etiqueta legible de un concepto fiscal (agnóstica de i18n) a partir del código + tipo. */
function conceptLabel(code: string, ratePercent: string): string {
  const pct = `${ratePercent}%`;
  if (code.startsWith('IVA')) return `IVA ${pct}`;
  if (code.startsWith('ITBIS')) return `ITBIS ${pct}`;
  if (code.startsWith('IRPF')) return `IRPF ${pct}`;
  return `${code} ${pct}`;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}

/** Genera el PDF del informe fiscal por periodo (representación impresa para pasar al asesor). */
export async function buildFiscalReportPdf(data: FiscalReportPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN, bufferPages: true });
  const left = PDF_MARGIN;
  const right = doc.page.width - PDF_MARGIN;
  const width = right - left;

  let y = drawBrandHeader(doc, {
    firmName: data.firmName,
    firmTaxId: data.firmTaxId,
    label: 'Informe fiscal',
    sublabel: `Periodo ${data.report.period.label}`,
  });

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.page.height - PDF_MARGIN - 10) {
      doc.addPage();
      y = PDF_MARGIN;
    }
  };

  doc
    .fillColor(PDF_MUTED)
    .font('Helvetica')
    .fontSize(8.5)
    .text(
      `Del ${data.report.period.start} al ${data.report.period.end} (fin exclusivo). Facturas emitidas.`,
      left,
      y,
      { width },
    );
  y = doc.y + 10;

  if (data.report.blocks.length === 0) {
    doc
      .fillColor(PDF_INK)
      .font('Helvetica')
      .fontSize(10)
      .text('Sin facturas emitidas en el periodo.', left, y);
    drawBrandFooter(doc, { note: 'Datos agregados; no es una presentación telemática oficial.' });
    return finalize(doc);
  }

  for (const block of data.report.blocks) {
    y = renderBlock(doc, block, left, width, y, ensureSpace);
    y += 12;
  }

  drawBrandFooter(doc, {
    note: 'Datos agregados; no es una presentación telemática oficial. Precursor del modelo 303 (ES) / declaraciones DGII (RD).',
  });
  return finalize(doc);
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  block: FiscalReportBlock,
  left: number,
  width: number,
  startY: number,
  ensureSpace: (n: number) => void,
): number {
  let y = startY;
  ensureSpace(60);

  const title =
    block.format === 'es'
      ? `España · Verifactu (${block.currency})`
      : block.format === 'do'
        ? `República Dominicana · e-CF (${block.currency})`
        : `${block.format.toUpperCase()} · ${block.recordFormat} (${block.currency})`;
  doc.fillColor(PDF_BRAND).font('Helvetica-Bold').fontSize(12).text(title, left, y);
  y = doc.y + 4;
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(1)
    .strokeColor(PDF_BRAND)
    .stroke();
  y += 8;

  // Impuesto repercutido por tipo.
  y = table(
    doc,
    left,
    width,
    y,
    ensureSpace,
    'Impuesto repercutido por tipo',
    ['Concepto', 'Facturas', 'Base', 'Cuota'],
    [0.4, 0.15, 0.225, 0.225],
    block.outputTax.map((r) => [
      conceptLabel(r.code, r.ratePercent),
      String(r.invoices),
      money(r.base, block.currency),
      money(r.tax, block.currency),
    ]),
  );

  // Retención IRPF por tipo (solo si hay).
  if (block.withholding.length > 0) {
    y += 8;
    y = table(
      doc,
      left,
      width,
      y,
      ensureSpace,
      'Retención IRPF practicada',
      ['Concepto', 'Facturas', 'Base', 'Retención'],
      [0.4, 0.15, 0.225, 0.225],
      block.withholding.map((r) => [
        conceptLabel(r.code, r.ratePercent),
        String(r.invoices),
        money(r.base, block.currency),
        money(r.amount, block.currency),
      ]),
    );
  }

  // Desglose por serie.
  y += 8;
  y = table(
    doc,
    left,
    width,
    y,
    ensureSpace,
    'Por serie de facturación',
    ['Serie', 'Facturas', 'Base', 'Impuesto', 'Retención', 'Total'],
    [0.24, 0.12, 0.16, 0.16, 0.16, 0.16],
    block.bySeries.map((s) => [
      s.series,
      String(s.invoices),
      money(s.base, block.currency),
      money(s.tax, block.currency),
      money(s.withholding, block.currency),
      money(s.total, block.currency),
    ]),
  );

  // Totales del bloque.
  y += 8;
  ensureSpace(24);
  doc.fillColor(PDF_INK).font('Helvetica-Bold').fontSize(9.5);
  const t = block.totals;
  doc.text(
    `Totales — Base: ${money(t.base, block.currency)} · Impuesto: ${money(t.tax, block.currency)} · ` +
      `Retención: ${money(t.withholding, block.currency)} · Total: ${money(t.total, block.currency)} · ` +
      `Facturas: ${t.invoices}`,
    left,
    y,
    { width },
  );
  return doc.y + 2;
}

/** Dibuja un título + tabla simple con anchos de columna proporcionales (fracciones que suman 1). */
function table(
  doc: PDFKit.PDFDocument,
  left: number,
  width: number,
  startY: number,
  ensureSpace: (n: number) => void,
  heading: string,
  headers: string[],
  fractions: number[],
  rows: string[][],
): number {
  let y = startY;
  ensureSpace(40);
  doc.fillColor(PDF_INK).font('Helvetica-Bold').fontSize(9.5).text(heading, left, y);
  y = doc.y + 4;

  const cols = fractions.map((f) => f * width);
  const x0 = left;

  const drawRow = (cells: string[], bold: boolean) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .fillColor(bold ? PDF_MUTED : PDF_INK);
    let x = x0;
    const rowY = y;
    cells.forEach((cell, i) => {
      const colW = cols[i] ?? 0;
      const align = i === 0 ? 'left' : 'right';
      doc.text(cell, x + 2, rowY, { width: colW - 4, align, lineBreak: false });
      x += colW;
    });
    y = rowY + 13;
  };

  drawRow(headers, true);
  doc
    .moveTo(x0, y - 2)
    .lineTo(x0 + width, y - 2)
    .lineWidth(0.5)
    .strokeColor(PDF_HAIRLINE)
    .stroke();
  if (rows.length === 0) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF_MUTED)
      .text('—', x0 + 2, y);
    return y + 13;
  }
  for (const row of rows) {
    ensureSpace(16);
    drawRow(row, false);
  }
  return y;
}

function finalize(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
