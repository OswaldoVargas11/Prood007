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
import type { FundsFlowReconciliation } from './funds-flow.logic';

// Uniones de strings locales (equivalentes a los enums de dominio/Prisma) para desacoplar el render.
type FundsFlowKind = 'PAYMENT' | 'ESCROW_DEPOSIT' | 'ESCROW_RELEASE' | 'FEE' | 'ADJUSTMENT';
type FundsFlowStatus = 'PLANNED' | 'SETTLED';
type EscrowStatus = 'HELD' | 'PARTIALLY_RELEASED' | 'RELEASED';

export interface FundsFlowStatementLine {
  kind: FundsFlowKind;
  payerName: string | null;
  payeeName: string | null;
  amount: string;
  currency: string;
  account?: string | null;
  condition?: string | null;
  status: FundsFlowStatus;
}

export interface FundsFlowStatementEscrow {
  label: string;
  amount: string;
  currency: string;
  agent?: string | null;
  status: EscrowStatus;
  released: string;
  remaining: string;
  releaseTrigger?: string | null;
}

export interface FundsFlowStatementData {
  firmName: string;
  firmTaxId?: string | null;
  matterReference: string;
  matterTitle: string;
  generatedAt: Date;
  lines: FundsFlowStatementLine[];
  reconciliation: FundsFlowReconciliation;
  escrowHoldings: FundsFlowStatementEscrow[];
}

const KIND_LABEL: Record<FundsFlowKind, string> = {
  PAYMENT: 'Pago',
  ESCROW_DEPOSIT: 'Depósito escrow',
  ESCROW_RELEASE: 'Liberación escrow',
  FEE: 'Honorarios/gastos',
  ADJUSTMENT: 'Ajuste',
};

const STATUS_LABEL: Record<FundsFlowStatus, string> = {
  PLANNED: 'Previsto',
  SETTLED: 'Liquidado',
};

const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  HELD: 'Retenido',
  PARTIALLY_RELEASED: 'Parcialmente liberado',
  RELEASED: 'Liberado',
};

function formatDate(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Importe (string) + moneda → "1.000.000,00 EUR" (formato es-ES). */
function money(amount: string, currency: string): string {
  const n = Number(amount);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount;
  return `${formatted} ${currency}`;
}

/**
 * Closing statement: portada con el expediente, la tabla del funds-flow (quién paga a quién, importe,
 * cuenta/condición y estado), el cuadre por moneda (con aviso de descuadre) y los depósitos en garantía
 * con su importe retenido/liberado/remanente. Mismo lenguaje visual que el closing binder y las facturas.
 */
export function buildFundsFlowStatement(data: FundsFlowStatementData): Promise<Buffer> {
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
      label: 'Funds flow',
      sublabel: `Generado el ${formatDate(data.generatedAt)}`,
    });

    doc
      .fillColor(PDF_INK)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('Estado de flujo de fondos', left, y, { width });
    y = doc.y + 4;
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(`${data.matterReference} · ${data.matterTitle}`, left, y, { width });
    y = doc.y + 4;
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica-Oblique')
      .fontSize(8)
      .text(
        'Documento de la operación. No constituye orden de pago ni movimiento de fondos reales.',
        left,
        y,
        { width },
      );
    y = doc.y + 14;

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - PDF_MARGIN - 24) {
        doc.addPage();
        y = PDF_MARGIN;
      }
    };

    const sectionHeader = (title: string) => {
      ensureSpace(40);
      doc.fillColor(PDF_BRAND).font('Helvetica-Bold').fontSize(12).text(title, left, y, { width });
      y = doc.y + 4;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_HAIRLINE).stroke();
      y += 8;
    };

    // ── Líneas del funds-flow ──────────────────────────────────────────────────
    sectionHeader(`Flujo de fondos (${data.lines.length})`);
    if (data.lines.length === 0) {
      doc
        .fillColor(PDF_MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text('Sin líneas de flujo de fondos registradas.', left, y, { width });
      y = doc.y + 10;
    } else {
      data.lines.forEach((line, idx) => {
        ensureSpace(44);
        const flow = `${line.payerName ?? '—'}  →  ${line.payeeName ?? '—'}`;
        doc
          .fillColor(PDF_INK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(`${idx + 1}. ${KIND_LABEL[line.kind]}`, left, y, { width: width - 130 });
        doc
          .fillColor(PDF_INK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(money(line.amount, line.currency), left, y, { width, align: 'right' });
        y = doc.y + 1;
        doc
          .fillColor(PDF_MUTED)
          .font('Helvetica')
          .fontSize(8.5)
          .text(flow, left + 12, y, { width: width - 12 });
        y = doc.y + 1;
        const meta: string[] = [`Estado: ${STATUS_LABEL[line.status]}`];
        if (line.account) meta.push(`Cuenta: ${line.account}`);
        if (line.condition) meta.push(`Condición: ${line.condition}`);
        doc
          .fillColor(PDF_MUTED)
          .font('Helvetica')
          .fontSize(8.5)
          .text(meta.join('   ·   '), left + 12, y, { width: width - 12 });
        y = doc.y + 8;
      });
    }
    y += 4;

    // ── Cuadre por moneda ──────────────────────────────────────────────────────
    sectionHeader('Cuadre por moneda');
    data.reconciliation.byCurrency.forEach((c) => {
      ensureSpace(26);
      const status = c.balanced ? 'Cuadra' : `Descuadre: ${money(String(c.imbalance), c.currency)}`;
      doc
        .fillColor(c.balanced ? PDF_INK : '#b91c1c')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(c.currency, left, y, { width: 60 });
      doc
        .fillColor(PDF_MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Sale ${money(String(c.totalPaid), c.currency)}   ·   Entra ${money(String(c.totalReceived), c.currency)}`,
          left + 60,
          y,
          { width: width - 60 - 150 },
        );
      doc
        .fillColor(c.balanced ? '#15803d' : '#b91c1c')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(status, left, y, { width, align: 'right' });
      y = doc.y + 6;
    });
    if (data.reconciliation.byCurrency.length === 0) {
      doc
        .fillColor(PDF_MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text('Sin importes que cuadrar.', left, y, { width });
      y = doc.y + 6;
    }
    y += 6;

    // ── Depósitos en garantía (escrow) ─────────────────────────────────────────
    sectionHeader(`Depósitos en garantía (${data.escrowHoldings.length})`);
    if (data.escrowHoldings.length === 0) {
      doc
        .fillColor(PDF_MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text('Sin depósitos en garantía registrados.', left, y, { width });
      y = doc.y + 6;
    } else {
      data.escrowHoldings.forEach((h, idx) => {
        ensureSpace(44);
        doc
          .fillColor(PDF_INK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(`${idx + 1}. ${h.label}`, left, y, { width: width - 130 });
        doc
          .fillColor(PDF_INK)
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .text(money(h.amount, h.currency), left, y, { width, align: 'right' });
        y = doc.y + 1;
        const meta: string[] = [`Estado: ${ESCROW_STATUS_LABEL[h.status]}`];
        meta.push(`Liberado: ${money(h.released, h.currency)}`);
        meta.push(`Remanente: ${money(h.remaining, h.currency)}`);
        if (h.agent) meta.push(`Agente: ${h.agent}`);
        if (h.releaseTrigger) meta.push(`Disparador: ${h.releaseTrigger}`);
        doc
          .fillColor(PDF_MUTED)
          .font('Helvetica')
          .fontSize(8.5)
          .text(meta.join('   ·   '), left + 12, y, { width: width - 12 });
        y = doc.y + 8;
      });
    }

    drawBrandFooter(doc, {
      note: `Funds flow · ${data.firmName} · ${data.matterReference}`,
    });
    doc.end();
  });
}
