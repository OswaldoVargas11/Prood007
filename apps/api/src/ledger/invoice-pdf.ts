/**
 * Generación de la representación impresa (PDF) de una factura, en el servidor, a partir de los
 * datos fiscales YA almacenados (no recalcula nada). Fuente única del layout para la descarga del
 * despacho y la del portal del cliente.
 *
 * Jurisdicción-aware: en ES (Verifactu) se pinta el QR de cotejo de la AEAT (de la `qrUrl` del
 * complianceRecord); en RD (e-CF) no aplica ese QR español → se muestra el eNCF + la huella.
 */
import PDFDocument from 'pdfkit';
import { toBuffer } from 'qrcode';
import { Jurisdiction } from '@legalflow/domain';

export interface InvoicePdfData {
  jurisdiction: Jurisdiction;
  seller: { name: string; taxId: string | null };
  buyer: { name: string; taxId: string | null };
  invoice: {
    number: string;
    issueDate: Date;
    currency: string;
    taxableBase: string;
    taxAmount: string;
    withholdingAmount: string;
    total: string;
  };
  lines: { description: string; quantity: string; unitPrice: string; lineTotal: string }[];
  compliance: { format: string | null; recordHash: string | null; qrUrl: string | null };
}

/** Fila de factura (con emisor/receptor/líneas) tal como la devuelve Prisma para el PDF. */
export interface InvoiceRow {
  number: string;
  issueDate: Date;
  currency: string;
  taxableBase: unknown;
  taxAmount: unknown;
  withholdingAmount: unknown;
  total: unknown;
  complianceRecord: unknown;
  complianceFormat: string | null;
  recordHash: string | null;
  tenant: { name: string; taxId: string | null };
  client: { name: string; taxId: string | null };
  lines: { description: string; quantity: unknown; unitPrice: unknown; lineTotal: unknown }[];
}

function extractQrUrl(record: unknown): string | null {
  if (record && typeof record === 'object' && 'qrUrl' in record) {
    const value = (record as Record<string, unknown>).qrUrl;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

/** Mapea la fila de Prisma (Decimals incluidos) a la entrada neutral del builder. */
export function invoiceRowToPdfData(inv: InvoiceRow, jurisdiction: Jurisdiction): InvoicePdfData {
  return {
    jurisdiction,
    seller: { name: inv.tenant.name, taxId: inv.tenant.taxId },
    buyer: { name: inv.client.name, taxId: inv.client.taxId },
    invoice: {
      number: inv.number,
      issueDate: inv.issueDate,
      currency: String(inv.currency),
      taxableBase: String(inv.taxableBase),
      taxAmount: String(inv.taxAmount),
      withholdingAmount: String(inv.withholdingAmount),
      total: String(inv.total),
    },
    lines: inv.lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      lineTotal: String(l.lineTotal),
    })),
    compliance: {
      format: inv.complianceFormat,
      recordHash: inv.recordHash,
      qrUrl: extractQrUrl(inv.complianceRecord),
    },
  };
}

const PAGE_MARGIN = 50;

function money(value: string, currency: string, locale: string): string {
  const n = Number(value);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    Number.isFinite(n) ? n : 0,
  );
}

/** Construye el PDF de la factura y resuelve con su Buffer. */
export async function buildInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const isES = data.jurisdiction === Jurisdiction.ES;
  const locale = isES ? 'es-ES' : 'es-DO';
  const taxIdLabel = isES ? 'NIF / CIF' : 'RNC / Cédula';
  const taxLabel = isES ? 'IVA' : 'ITBIS';
  const fmt = (v: string) => money(v, data.invoice.currency, locale);

  // El QR (cotejo AEAT) solo aplica al formato Verifactu y solo si hay URL en el registro fiscal.
  const qrPng =
    data.compliance.format === 'VERIFACTU' && data.compliance.qrUrl
      ? await toBuffer(data.compliance.qrUrl, { margin: 1, width: 132 })
      : null;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const width = right - left;

    // ── Cabecera ──────────────────────────────────────────────────────────
    doc.fontSize(20).font('Helvetica-Bold').text('FACTURA', left, PAGE_MARGIN);
    doc.fontSize(10).font('Helvetica').fillColor('#555');
    doc.text(`Nº ${data.invoice.number}`, left, PAGE_MARGIN + 26);
    doc.text(
      `Fecha de emisión: ${data.invoice.issueDate.toISOString().slice(0, 10)}`,
      left,
      PAGE_MARGIN + 40,
    );
    doc.fillColor('#000');

    // ── Emisor / Receptor ─────────────────────────────────────────────────
    const blockY = PAGE_MARGIN + 70;
    const colW = width / 2 - 10;
    party(doc, 'Emisor (despacho)', data.seller, taxIdLabel, left, blockY, colW);
    party(doc, 'Receptor (cliente)', data.buyer, taxIdLabel, left + colW + 20, blockY, colW);

    // ── Tabla de líneas ───────────────────────────────────────────────────
    let y = blockY + 80;
    const cols = { desc: left, qty: left + width * 0.55, price: left + width * 0.7, total: right };
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#555');
    doc.text('Concepto', cols.desc, y);
    doc.text('Cant.', cols.qty, y, { width: width * 0.13, align: 'right' });
    doc.text('Precio', cols.price, y, { width: width * 0.13, align: 'right' });
    doc.text('Total', cols.total - width * 0.15, y, { width: width * 0.15, align: 'right' });
    doc.fillColor('#000').font('Helvetica');
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#ddd').stroke();
    y += 6;

    for (const line of data.lines) {
      const descHeight = doc.heightOfString(line.description, { width: width * 0.5 });
      doc.fontSize(9).text(line.description, cols.desc, y, { width: width * 0.5 });
      doc.text(line.quantity, cols.qty, y, { width: width * 0.13, align: 'right' });
      doc.text(fmt(line.unitPrice), cols.price, y, { width: width * 0.13, align: 'right' });
      doc.text(fmt(line.lineTotal), cols.total - width * 0.15, y, {
        width: width * 0.15,
        align: 'right',
      });
      y += Math.max(descHeight, 12) + 6;
    }

    // ── Totales ───────────────────────────────────────────────────────────
    y += 6;
    doc
      .moveTo(left + width * 0.5, y)
      .lineTo(right, y)
      .strokeColor('#ddd')
      .stroke();
    y += 8;
    const totalsX = left + width * 0.5;
    const totalsW = width * 0.5;
    totalRow(doc, 'Base imponible', fmt(data.invoice.taxableBase), totalsX, y, totalsW);
    y += 16;
    totalRow(doc, `Impuestos (${taxLabel})`, fmt(data.invoice.taxAmount), totalsX, y, totalsW);
    y += 16;
    if (Number(data.invoice.withholdingAmount) > 0) {
      totalRow(
        doc,
        'Retención (IRPF)',
        `− ${fmt(data.invoice.withholdingAmount)}`,
        totalsX,
        y,
        totalsW,
      );
      y += 16;
    }
    doc.font('Helvetica-Bold');
    totalRow(doc, 'TOTAL', fmt(data.invoice.total), totalsX, y, totalsW);
    doc.font('Helvetica');
    y += 30;

    // ── Bloque de cumplimiento fiscal ─────────────────────────────────────
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#ddd').stroke();
    y += 12;
    const formatLabel =
      data.compliance.format === 'VERIFACTU'
        ? 'Verifactu · AEAT'
        : data.compliance.format === 'ECF'
          ? 'e-CF · DGII'
          : 'Registro fiscal';
    doc.fontSize(9).font('Helvetica-Bold').text(formatLabel, left, y);
    doc.font('Helvetica').fillColor('#555');
    if (!isES) {
      // En RD el documento fiscal es el e-CF; su identificador es el eNCF (= número de la factura).
      doc.text(`eNCF: ${data.invoice.number}`, left, y + 14);
    }
    if (data.compliance.recordHash) {
      doc.fontSize(7).text(`Huella: ${data.compliance.recordHash}`, left, y + 28, {
        width: width - 160,
      });
    }
    doc.fillColor('#000');

    if (qrPng) {
      const qrSize = 110;
      doc.image(qrPng, right - qrSize, y, { width: qrSize });
      doc
        .fontSize(7)
        .fillColor('#555')
        .text('Cotejo AEAT', right - qrSize, y + qrSize + 2, { width: qrSize, align: 'center' })
        .fillColor('#000');
    }

    doc.end();
  });
}

function party(
  doc: PDFKit.PDFDocument,
  title: string,
  p: { name: string; taxId: string | null },
  taxIdLabel: string,
  x: number,
  y: number,
  w: number,
): void {
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#888').text(title.toUpperCase(), x, y, {
    width: w,
  });
  doc
    .fillColor('#000')
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(p.name, x, y + 12, { width: w });
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#555')
    .text(`${taxIdLabel}: ${p.taxId ?? '—'}`, x, y + 28, { width: w })
    .fillColor('#000');
}

function totalRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
): void {
  doc.fontSize(10).text(label, x, y, { width: w * 0.6 });
  doc.text(value, x + w * 0.6, y, { width: w * 0.4, align: 'right' });
}
