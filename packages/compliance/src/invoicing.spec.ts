import type { InvoiceInput } from './types';
import { SpainComplianceProvider } from './providers/spain.provider';
import { DominicanComplianceProvider } from './providers/dominican.provider';
import { computeInvoiceTotals, round2 } from './tax-math';

const baseInvoice = (overrides: Partial<InvoiceInput> = {}): InvoiceInput => ({
  invoiceNumber: 'F-2026-0001',
  issueDate: '2026-01-15',
  currency: 'EUR',
  seller: { name: 'Despacho', taxId: '12345678Z' },
  buyer: { name: 'Cliente', taxId: 'B12345674' },
  lines: [{ description: 'Honorarios', quantity: '10', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
  ...overrides,
});

describe('España — buildInvoiceRecord (Verifactu)', () => {
  const es = new SpainComplianceProvider();

  it('calcula base, IVA 21% y retención IRPF 15%', async () => {
    const rec = await es.buildInvoiceRecord(baseInvoice({ withholdingTaxCode: 'IRPF_GENERAL' }));
    expect(rec.totals.taxableBase).toBe('1000.00');
    expect(rec.totals.taxAmount).toBe('210.00');
    expect(rec.totals.withholdingAmount).toBe('150.00');
    expect(rec.totals.total).toBe('1060.00'); // 1000 + 210 − 150
  });

  it('sin retención el total es base + IVA', async () => {
    const rec = await es.buildInvoiceRecord(baseInvoice());
    expect(rec.totals.withholdingAmount).toBe('0.00');
    expect(rec.totals.total).toBe('1210.00');
  });

  it('genera huella SHA-256 y encadena con la huella anterior', async () => {
    const first = await es.buildInvoiceRecord(baseInvoice({ invoiceNumber: 'F-1' }));
    expect(first.recordHash).toMatch(/^[a-f0-9]{64}$/);

    const second = await es.buildInvoiceRecord(
      baseInvoice({ invoiceNumber: 'F-2', previousRecordHash: first.recordHash }),
    );
    expect(
      (second.payload as { encadenamiento: { huellaAnterior: string } }).encadenamiento
        .huellaAnterior,
    ).toBe(first.recordHash);
    expect(second.recordHash).not.toBe(first.recordHash);
  });

  it('la huella es determinista para los mismos datos', async () => {
    const a = await es.buildInvoiceRecord(baseInvoice({ invoiceNumber: 'F-X' }));
    const b = await es.buildInvoiceRecord(baseInvoice({ invoiceNumber: 'F-X' }));
    expect(a.recordHash).toBe(b.recordHash);
  });

  it('incluye una URL de validación QR con el importe total', async () => {
    const rec = await es.buildInvoiceRecord(baseInvoice());
    const qr = (rec.payload as { qrUrl: string }).qrUrl;
    expect(qr).toContain('ValidarQR');
    expect(qr).toContain('importe=1210.00');
  });
});

describe('República Dominicana — buildInvoiceRecord (e-CF)', () => {
  const dom = new DominicanComplianceProvider();

  it('calcula ITBIS 18% sin retención', async () => {
    const rec = await dom.buildInvoiceRecord(
      baseInvoice({
        currency: 'DOP',
        seller: { name: 'Despacho', taxId: '101010101' },
        buyer: { name: 'Cliente', taxId: '130000000' },
        lines: [
          { description: 'Honorarios', quantity: '5', unitPrice: '200', taxCode: 'ITBIS_STANDARD' },
        ],
      }),
    );
    expect(rec.totals.taxableBase).toBe('1000.00');
    expect(rec.totals.taxAmount).toBe('180.00');
    expect(rec.totals.total).toBe('1180.00');
    expect(String((rec.payload as { ecfXml: string }).ecfXml)).toContain(
      '<MontoTotal>1180.00</MontoTotal>',
    );
  });
});

describe('computeInvoiceTotals — validación de códigos fiscales (gate de facturación)', () => {
  const rates = [
    { code: 'IVA_STANDARD', labelKey: 'tax.es.iva', ratePercent: '21', withholding: false },
    { code: 'IRPF_GENERAL', labelKey: 'tax.es.irpf', ratePercent: '15', withholding: true },
  ];
  const line = (taxCode: string) => [
    { description: 'x', quantity: '1', unitPrice: '100', taxCode },
  ];

  it('lanza si el código de impuesto de línea es desconocido', () => {
    expect(() => computeInvoiceTotals(line('NO_EXISTE'), rates)).toThrow(/desconocido/);
  });

  it('lanza si se usa un código de retención como impuesto de línea', () => {
    expect(() => computeInvoiceTotals(line('IRPF_GENERAL'), rates)).toThrow(/retención/);
  });

  it('lanza si el withholdingTaxCode no es de retención o no existe', () => {
    expect(() => computeInvoiceTotals(line('IVA_STANDARD'), rates, 'IVA_STANDARD')).toThrow(
      /retención no válido/,
    );
    expect(() => computeInvoiceTotals(line('IVA_STANDARD'), rates, 'NO_EXISTE')).toThrow(
      /retención no válido/,
    );
  });

  it('redondea a 2 decimales preservando el signo (importes negativos)', () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.236)).toBe(1.24);
    expect(round2(-1.234)).toBe(-1.23);
    expect(round2(-1.236)).toBe(-1.24);
  });
});
