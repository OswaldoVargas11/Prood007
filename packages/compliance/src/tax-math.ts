/**
 * Aritmética fiscal de facturas, agnóstica de país. Cada provider aporta sus tasas (getTaxRates)
 * y aquí se computan base imponible, impuestos repercutidos (IVA/ITBIS) y retenciones (IRPF).
 *
 * Se redondea a 2 decimales por importe (round half away from zero), suficiente y determinista
 * para el MVP. Para producción se puede sustituir por una librería decimal sin tocar la frontera.
 */
import type { InvoiceLineInput, InvoiceTotals, TaxRate } from './types';

/** Redondeo a 2 decimales, half-up sobre el valor absoluto (evita errores de coma flotante). */
export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + Number.EPSILON)) / 100;
}

function toMoney(value: number): string {
  return round2(value).toFixed(2);
}

export interface LineComputation {
  base: number;
  taxCode: string;
  taxRatePercent: number;
  taxAmount: number;
}

export interface InvoiceComputation {
  totals: InvoiceTotals;
  lines: LineComputation[];
}

/**
 * Computa los totales de una factura.
 * - taxableBase = Σ (cantidad × precio unitario)
 * - taxAmount   = Σ (base de línea × tasa del taxCode no-retención)
 * - withholding = base imponible total × tasa del withholdingTaxCode (si se indica)
 * - total       = base + impuestos − retención
 */
export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  rates: TaxRate[],
  withholdingTaxCode?: string,
): InvoiceComputation {
  const rateByCode = new Map(rates.map((r) => [r.code, r]));

  const computedLines: LineComputation[] = lines.map((line) => {
    const rate = rateByCode.get(line.taxCode);
    if (!rate) throw new Error(`Código de impuesto desconocido: ${line.taxCode}`);
    if (rate.withholding) {
      throw new Error(`El código ${line.taxCode} es de retención; no puede ser impuesto de línea.`);
    }
    const base = round2(Number(line.quantity) * Number(line.unitPrice));
    const taxRatePercent = Number(rate.ratePercent);
    const taxAmount = round2((base * taxRatePercent) / 100);
    return { base, taxCode: line.taxCode, taxRatePercent, taxAmount };
  });

  const taxableBase = round2(computedLines.reduce((sum, l) => sum + l.base, 0));
  const taxAmount = round2(computedLines.reduce((sum, l) => sum + l.taxAmount, 0));

  let withholdingAmount = 0;
  if (withholdingTaxCode) {
    const wRate = rateByCode.get(withholdingTaxCode);
    if (!wRate || !wRate.withholding) {
      throw new Error(`Código de retención no válido: ${withholdingTaxCode}`);
    }
    withholdingAmount = round2((taxableBase * Number(wRate.ratePercent)) / 100);
  }

  const total = round2(taxableBase + taxAmount - withholdingAmount);

  return {
    totals: {
      taxableBase: toMoney(taxableBase),
      taxAmount: toMoney(taxAmount),
      withholdingAmount: toMoney(withholdingAmount),
      total: toMoney(total),
    },
    lines: computedLines,
  };
}
