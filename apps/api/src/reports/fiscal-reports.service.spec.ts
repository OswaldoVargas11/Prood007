import { Jurisdiction } from '@legalflow/domain';
import { ComplianceService } from '../compliance/compliance.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';
import {
  FiscalReportsService,
  deriveSeries,
  resolvePeriod,
  type FiscalReportBlock,
} from './fiscal-reports.service';

const user: RequestUser = {
  userId: 'u1',
  tenantId: 'tenant-1',
  jurisdiction: Jurisdiction.ES,
  email: 'a@d.test',
  roles: ['FIRM_ADMIN'],
};

/**
 * Fixture multi-tipo (una línea por factura salvo indicación):
 *  ES (EUR):
 *   - INV1 IVA 21% base 1000 → cuota 210
 *   - INV2 IVA 10% base 500  → cuota 50
 *   - INV3 IVA 4%  base 200  → cuota 8
 *   - INV4 IVA 21% base 1000 + retención IRPF 15% → cuota 210, retención 150
 *   - INV5 RECTIFICATIVA (líneas negativas) que revierte INV1: base −1000, cuota −210  ⇒ RESTA
 *  RD (DOP):
 *   - INV6 ITBIS 18% base 1000 → cuota 180
 */
function invoiceFixture() {
  const line = (quantity: string, unitPrice: string, taxCode: string) => ({
    quantity,
    unitPrice,
    taxCode,
  });
  return [
    {
      id: 'i1',
      number: 'FAC-2026-0001',
      invoiceFormat: 'es',
      currency: 'EUR',
      taxableBase: '1000.00',
      taxAmount: '210.00',
      withholdingAmount: '0.00',
      withholdingTaxCode: null,
      total: '1210.00',
      lines: [line('1', '1000', 'IVA_STANDARD')],
    },
    {
      id: 'i2',
      number: 'FAC-2026-0002',
      invoiceFormat: 'es',
      currency: 'EUR',
      taxableBase: '500.00',
      taxAmount: '50.00',
      withholdingAmount: '0.00',
      withholdingTaxCode: null,
      total: '550.00',
      lines: [line('1', '500', 'IVA_REDUCED')],
    },
    {
      id: 'i3',
      number: 'FAC-2026-0003',
      invoiceFormat: 'es',
      currency: 'EUR',
      taxableBase: '200.00',
      taxAmount: '8.00',
      withholdingAmount: '0.00',
      withholdingTaxCode: null,
      total: '208.00',
      lines: [line('1', '200', 'IVA_SUPERREDUCED')],
    },
    {
      id: 'i4',
      number: 'FAC-2026-0004',
      invoiceFormat: 'es',
      currency: 'EUR',
      taxableBase: '1000.00',
      taxAmount: '210.00',
      withholdingAmount: '150.00',
      withholdingTaxCode: 'IRPF_GENERAL',
      total: '1060.00',
      lines: [line('1', '1000', 'IVA_STANDARD')],
    },
    {
      id: 'i5',
      number: 'FAC-2026-0005',
      invoiceFormat: 'es',
      currency: 'EUR',
      taxableBase: '-1000.00',
      taxAmount: '-210.00',
      withholdingAmount: '0.00',
      withholdingTaxCode: null,
      total: '-1210.00',
      lines: [line('1', '-1000', 'IVA_STANDARD')],
    },
    {
      id: 'i6',
      number: 'E310000000001',
      invoiceFormat: 'do',
      currency: 'DOP',
      taxableBase: '1000.00',
      taxAmount: '180.00',
      withholdingAmount: '0.00',
      withholdingTaxCode: null,
      total: '1180.00',
      lines: [line('1', '1000', 'ITBIS_STANDARD')],
    },
  ];
}

function makeService(rows: ReturnType<typeof invoiceFixture>) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    invoice: { findMany },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Despacho Demo', taxId: 'B12345674' }),
    },
  } as unknown as PrismaService;
  return { svc: new FiscalReportsService(prisma, new ComplianceService()), findMany };
}

const byFormat = (blocks: FiscalReportBlock[], f: string) => blocks.find((b) => b.format === f)!;
const taxRow = (b: FiscalReportBlock, code: string) => b.outputTax.find((r) => r.code === code)!;

describe('deriveSeries', () => {
  it('deriva la serie interna del número FAC-2026-0001', () => {
    expect(deriveSeries('FAC-2026-0001')).toBe('FAC');
    expect(deriveSeries('ABOG-2025-0123')).toBe('ABOG');
  });
  it('deriva el prefijo del eNCF (E31/E34)', () => {
    expect(deriveSeries('E310000000001')).toBe('E31');
    expect(deriveSeries('E340000000009')).toBe('E34');
  });
});

describe('resolvePeriod', () => {
  it('año completo cuando no hay mes ni trimestre', () => {
    const p = resolvePeriod({ year: 2026 });
    expect(p).toMatchObject({
      label: '2026',
      start: '2026-01-01',
      end: '2027-01-01',
      quarter: null,
    });
  });
  it('trimestre natural', () => {
    const p = resolvePeriod({ year: 2026, quarter: 2 });
    expect(p).toMatchObject({ label: 'T2 2026', start: '2026-04-01', end: '2026-07-01' });
  });
  it('el mes tiene prioridad sobre el trimestre', () => {
    const p = resolvePeriod({ year: 2026, month: 3, quarter: 2 });
    expect(p).toMatchObject({
      label: '2026-03',
      start: '2026-03-01',
      end: '2026-04-01',
      quarter: null,
    });
  });
});

describe('FiscalReportsService.periodReport', () => {
  it('acota SIEMPRE por tenant + emitidas + periodo (RLS)', async () => {
    const { svc, findMany } = makeService(invoiceFixture());
    await svc.periodReport(user, { year: 2026, quarter: 1 });
    const where = findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-1');
    expect(where.status.in).toContain('ISSUED');
    expect(where.issueDate.gte).toEqual(new Date('2026-01-01'));
    expect(where.issueDate.lt).toEqual(new Date('2026-04-01'));
  });

  it('desglosa el IVA repercutido por tipo (21/10/4) y las rectificativas RESTAN', async () => {
    const { svc } = makeService(invoiceFixture());
    const { blocks } = await svc.periodReport(user, { year: 2026 });
    const es = byFormat(blocks, 'es');

    // IVA 21%: INV1 (1000) + INV4 (1000) − INV5 rectificativa (1000) = base neta 1000, cuota 210.
    expect(taxRow(es, 'IVA_STANDARD')).toMatchObject({
      ratePercent: '21',
      base: 1000,
      tax: 210,
      invoices: 3,
    });
    expect(taxRow(es, 'IVA_REDUCED')).toMatchObject({ ratePercent: '10', base: 500, tax: 50 });
    expect(taxRow(es, 'IVA_SUPERREDUCED')).toMatchObject({ ratePercent: '4', base: 200, tax: 8 });
    // Orden por tipo descendente (21, 10, 4).
    expect(es.outputTax.map((r) => r.ratePercent)).toEqual(['21', '10', '4']);
  });

  it('desglosa la retención IRPF por tipo', async () => {
    const { svc } = makeService(invoiceFixture());
    const { blocks } = await svc.periodReport(user, { year: 2026 });
    const es = byFormat(blocks, 'es');
    expect(es.withholding).toHaveLength(1);
    expect(es.withholding[0]).toMatchObject({
      code: 'IRPF_GENERAL',
      ratePercent: '15',
      base: 1000,
      amount: 150,
      invoices: 1,
    });
  });

  it('los totales del bloque cuadran a mano contra las facturas', async () => {
    const { svc } = makeService(invoiceFixture());
    const { blocks } = await svc.periodReport(user, { year: 2026 });
    const es = byFormat(blocks, 'es');
    // base 1000+500+200+1000−1000 = 1700 · IVA 210+50+8+210−210 = 268 · IRPF 150 · total 1210+550+208+1060−1210 = 1818
    expect(es.totals).toEqual({ base: 1700, tax: 268, withholding: 150, total: 1818, invoices: 5 });
    // Cross-foot: la suma del desglose por tipo = la cuota total del bloque.
    expect(es.outputTax.reduce((s, r) => s + r.tax, 0)).toBe(es.totals.tax);
    expect(es.outputTax.reduce((s, r) => s + r.base, 0)).toBe(es.totals.base);
    // Desglose por serie (todas FAC).
    expect(es.bySeries).toHaveLength(1);
    expect(es.bySeries[0]).toMatchObject({
      series: 'FAC',
      invoices: 5,
      base: 1700,
      tax: 268,
      total: 1818,
    });
  });

  it('separa el bloque RD (e-CF / ITBIS 18%) del bloque ES, sin mezclar monedas', async () => {
    const { svc } = makeService(invoiceFixture());
    const { blocks } = await svc.periodReport(user, { year: 2026 });
    const doBlock = byFormat(blocks, 'do');
    expect(doBlock.currency).toBe('DOP');
    expect(doBlock.recordFormat).toBe('ECF');
    expect(taxRow(doBlock, 'ITBIS_STANDARD')).toMatchObject({
      ratePercent: '18',
      base: 1000,
      tax: 180,
    });
    expect(doBlock.totals).toEqual({
      base: 1000,
      tax: 180,
      withholding: 0,
      total: 1180,
      invoices: 1,
    });
    expect(doBlock.bySeries[0]?.series).toBe('E31');
  });

  it('sin facturas devuelve el periodo con bloques vacíos', async () => {
    const { svc } = makeService([]);
    const report = await svc.periodReport(user, { year: 2026, month: 5 });
    expect(report.blocks).toHaveLength(0);
    expect(report.period.label).toBe('2026-05');
  });
});

describe('FiscalReportsService — exportadores', () => {
  it('periodPdf devuelve un PDF (firma %PDF) con nombre por periodo', async () => {
    const { svc } = makeService(invoiceFixture());
    const { buffer, filename } = await svc.periodPdf(user, { year: 2026, quarter: 2 });
    expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(filename).toBe('informe-fiscal-T2-2026.pdf');
  });

  it('periodXlsx devuelve un XLSX (firma ZIP PK) con nombre por periodo', async () => {
    const { svc } = makeService(invoiceFixture());
    const { buffer, filename } = await svc.periodXlsx(user, { year: 2026 });
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(filename).toBe('informe-fiscal-2026.xlsx');
  });
});
