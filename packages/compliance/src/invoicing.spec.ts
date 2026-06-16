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

describe('Deducción de anticipos en la factura final (D-027 (b)) — sin doble imposición', () => {
  const es = new SpainComplianceProvider();
  const dom = new DominicanComplianceProvider();

  it('ES: la final neutraliza base+IVA del anticipo (IVA acumulado = IVA del total)', async () => {
    // Servicio completo 3000 (IVA 630). Anticipo previo de 1000 (IVA 210) ya facturado.
    const final = await es.buildInvoiceRecord(
      baseInvoice({
        invoiceNumber: 'FAC-2026-0002',
        lines: [
          {
            description: 'Honorarios (servicio completo)',
            quantity: '1',
            unitPrice: '3000',
            taxCode: 'IVA_STANDARD',
          },
          {
            description: 'Deducción anticipo FAC-2026-0001',
            quantity: '1',
            unitPrice: '-1000',
            taxCode: 'IVA_STANDARD',
          },
        ],
        deductedAdvances: [
          { invoiceNumber: 'FAC-2026-0001', base: '1000.00', taxCode: 'IVA_STANDARD' },
        ],
      }),
    );
    // Neto en la final: base 2000, IVA 420, total 2420.
    expect(final.totals.taxableBase).toBe('2000.00');
    expect(final.totals.taxAmount).toBe('420.00');
    expect(final.totals.total).toBe('2420.00');
    // IVA acumulado = 210 (anticipo) + 420 (final) = 630 = IVA sobre los 3000 del servicio. Sin doble IVA.
    expect(round2(210 + Number(final.totals.taxAmount))).toBe(630);
    // Trazabilidad: el registro referencia la factura de anticipo deducida.
    const block = (final.payload as { anticiposDeducidos?: { numFactura: string }[] })
      .anticiposDeducidos;
    expect(block).toEqual([
      { numFactura: 'FAC-2026-0001', baseDeducida: '1000.00', impuesto: 'IVA_STANDARD' },
    ]);
  });

  it('ES: sin anticipos deducidos el bloque de trazabilidad no aparece', async () => {
    const rec = await es.buildInvoiceRecord(baseInvoice());
    expect((rec.payload as { anticiposDeducidos?: unknown }).anticiposDeducidos).toBeUndefined();
  });

  it('RD: el e-CF final incluye el bloque de anticipos deducidos', async () => {
    const final = await dom.buildInvoiceRecord(
      baseInvoice({
        currency: 'DOP',
        invoiceNumber: 'E310000000002',
        seller: { name: 'Despacho', taxId: '101010101' },
        buyer: { name: 'Cliente', taxId: '130000000' },
        lines: [
          {
            description: 'Servicio completo',
            quantity: '1',
            unitPrice: '3000',
            taxCode: 'ITBIS_STANDARD',
          },
          {
            description: 'Deducción anticipo E310000000001',
            quantity: '1',
            unitPrice: '-1000',
            taxCode: 'ITBIS_STANDARD',
          },
        ],
        deductedAdvances: [
          { invoiceNumber: 'E310000000001', base: '1000.00', taxCode: 'ITBIS_STANDARD' },
        ],
      }),
    );
    // Neto: base 2000, ITBIS 360, total 2360. ITBIS acumulado = 180 + 360 = 540 = 18% de 3000.
    expect(final.totals.taxAmount).toBe('360.00');
    const xml = String((final.payload as { ecfXml: string }).ecfXml);
    expect(xml).toContain('<AnticiposDeducidos>');
    expect(xml).toContain('<eNCFAnticipo>E310000000001</eNCFAnticipo>');
    expect(xml).toContain('<MontoGravadoDeducido>1000.00</MontoGravadoDeducido>');
  });
});

describe('previewInvoice — pre-cálculo read-only sin divergencia con la emisión real', () => {
  const es = new SpainComplianceProvider();
  const dom = new DominicanComplianceProvider();

  it('ES: el preview reproduce EXACTAMENTE los totales de buildInvoiceRecord (con retención)', async () => {
    const inv = baseInvoice({ withholdingTaxCode: 'IRPF_GENERAL' });
    const preview = es.previewInvoice(inv.lines, inv.withholdingTaxCode);
    const emitted = await es.buildInvoiceRecord(inv);
    expect(preview.totals).toEqual(emitted.totals);
    expect(preview.format).toBe('VERIFACTU');
    expect(preview.jurisdiction).toBe('es');
    // Mismos números que la emisión: base 1000, IVA 210, IRPF 150, total 1060.
    expect(preview.totals.total).toBe('1060.00');
  });

  it('ES: sin retención, preview = emisión (base + IVA)', async () => {
    const inv = baseInvoice();
    const preview = es.previewInvoice(inv.lines, inv.withholdingTaxCode);
    const emitted = await es.buildInvoiceRecord(inv);
    expect(preview.totals).toEqual(emitted.totals);
    expect(preview.totals.total).toBe('1210.00');
  });

  it('RD: el preview reproduce los totales del e-CF (ITBIS 18%)', async () => {
    const inv = baseInvoice({
      currency: 'DOP',
      seller: { name: 'Despacho', taxId: '101010101' },
      buyer: { name: 'Cliente', taxId: '130000000' },
      lines: [
        { description: 'Honorarios', quantity: '5', unitPrice: '200', taxCode: 'ITBIS_STANDARD' },
      ],
    });
    const preview = dom.previewInvoice(inv.lines);
    const emitted = await dom.buildInvoiceRecord(inv);
    expect(preview.totals).toEqual(emitted.totals);
    expect(preview.format).toBe('ECF');
    expect(preview.jurisdiction).toBe('do');
    expect(preview.totals.total).toBe('1180.00');
  });

  it('propaga el error de un código fiscal inválido (no se emite nada)', () => {
    expect(() =>
      es.previewInvoice([
        { description: '', quantity: '1', unitPrice: '100', taxCode: 'NO_EXISTE' },
      ]),
    ).toThrow(/desconocido/);
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
