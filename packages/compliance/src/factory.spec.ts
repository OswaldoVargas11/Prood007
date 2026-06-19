import { Jurisdiction, TaxIdKind } from '@legalflow/domain';
import { ComplianceProviderFactory } from './factory';
import { SpainComplianceProvider } from './providers/spain.provider';
import { DominicanComplianceProvider } from './providers/dominican.provider';

describe('ComplianceProviderFactory', () => {
  it('devuelve el provider de España para jurisdicción es', () => {
    const p = ComplianceProviderFactory.get(Jurisdiction.ES);
    expect(p).toBeInstanceOf(SpainComplianceProvider);
    expect(p.jurisdiction).toBe(Jurisdiction.ES);
  });

  it('devuelve el provider de RD para jurisdicción do', () => {
    const p = ComplianceProviderFactory.get(Jurisdiction.DO);
    expect(p).toBeInstanceOf(DominicanComplianceProvider);
    expect(p.jurisdiction).toBe(Jurisdiction.DO);
  });

  it('cachea la instancia por jurisdicción', () => {
    expect(ComplianceProviderFactory.get(Jurisdiction.ES)).toBe(
      ComplianceProviderFactory.get(Jurisdiction.ES),
    );
  });

  it('lanza si la jurisdicción no tiene provider registrado', () => {
    expect(() => ComplianceProviderFactory.get('XX' as unknown as Jurisdiction)).toThrow(
      /No hay ComplianceProvider/,
    );
  });
});

describe('SpainComplianceProvider', () => {
  const es = new SpainComplianceProvider();

  it('valida un NIF con forma correcta y normaliza', () => {
    const r = es.validateTaxId('12345678-z');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('12345678Z');
  });

  it('rechaza un identificador inválido con clave i18n', () => {
    const r = es.validateTaxId('???');
    expect(r.valid).toBe(false);
    expect(r.error?.messageKey).toBe('compliance.es.taxId.invalid');
  });

  it('acepta pasaporte (validación ligera) y rechaza uno malformado', () => {
    const ok = es.validateTaxId('AB1234567', TaxIdKind.PASSPORT);
    expect(ok.valid).toBe(true);
    expect(ok.kind).toBe(TaxIdKind.PASSPORT);
    const bad = es.validateTaxId('A!', TaxIdKind.PASSPORT);
    expect(bad.valid).toBe(false);
    expect(bad.error?.messageKey).toBe('compliance.doc.invalid');
  });

  it('expone IVA 21% y retención IRPF', () => {
    const rates = es.getTaxRates();
    const iva = rates.rates.find((x) => x.code === 'IVA_STANDARD');
    const irpf = rates.rates.find((x) => x.code === 'IRPF_GENERAL');
    expect(iva?.ratePercent).toBe('21');
    expect(iva?.withholding).toBe(false);
    expect(irpf?.withholding).toBe(true);
  });

  it('genera un registro Verifactu stubbeado', async () => {
    const rec = await es.buildInvoiceRecord({
      invoiceNumber: 'F-2026-0001',
      issueDate: '2026-01-15',
      currency: 'EUR',
      seller: { name: 'Despacho', taxId: '12345678Z' },
      buyer: { name: 'Cliente', taxId: 'B12345674' },
      lines: [],
    });
    expect(rec.format).toBe('VERIFACTU');
    expect(rec.submission.status).toBe('STUBBED');
  });

  it('calcula plazos procesales en días hábiles (delegado a deadlines)', () => {
    const r = es.getProceduralDeadlines({
      startDate: '2026-12-23',
      days: 5,
      deadlineType: 'GENERIC',
    });
    expect(r.businessDays).toBe(true);
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('expone la integración LexNET stubbeada (listar/acusar/presentar)', async () => {
    const court = es.getCourtIntegration();
    expect(court.available).toBe(true);
    expect(court.system).toBe('LEXNET');
    expect(await court.listNotifications!()).toEqual([]);
    expect((await court.acknowledge!('n-1')).notificationId).toBe('n-1');
    const receipt = await court.submitFiling!({
      caseReference: 'c-1',
      documentRefs: [],
      type: 'ESCRITO',
    });
    expect(receipt.status).toBe('ACCEPTED');
  });

  it('genera un suministro SII stubbeado', async () => {
    const reports = es.getFiscalReports();
    expect(reports.supported).toContain('SII');
    const out = await reports.generate('SII', { period: '2026-01' });
    expect(out.format).toBe('XML');
    expect(out.submission.status).toBe('STUBBED');
  });
});

describe('DominicanComplianceProvider', () => {
  const dom = new DominicanComplianceProvider();

  it('valida un RNC de 9 dígitos', () => {
    expect(dom.validateTaxId('101010101').valid).toBe(true);
  });

  it('valida una Cédula de 11 dígitos', () => {
    const r = dom.validateTaxId('001-1234567-3');
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe('00112345673');
  });

  it('rechaza una Cedula con digito de control incorrecto', () => {
    const r = dom.validateTaxId('001-1234567-8');
    expect(r.valid).toBe(false);
    expect(r.error?.messageKey).toBe('compliance.do.taxId.invalid');
  });

  it('acepta pasaporte/otro (validación ligera) y rechaza uno malformado', () => {
    const ok = dom.validateTaxId('P0123456', TaxIdKind.OTHER);
    expect(ok.valid).toBe(true);
    expect(ok.kind).toBe(TaxIdKind.OTHER);
    const bad = dom.validateTaxId('A!', TaxIdKind.PASSPORT);
    expect(bad.valid).toBe(false);
    expect(bad.error?.messageKey).toBe('compliance.doc.invalid');
  });

  it('expone ITBIS 18%', () => {
    const itbis = dom.getTaxRates().rates.find((x) => x.code === 'ITBIS_STANDARD');
    expect(itbis?.ratePercent).toBe('18');
  });

  it('genera un e-CF XML stubbeado', async () => {
    const rec = await dom.buildInvoiceRecord({
      invoiceNumber: 'E310000000001',
      issueDate: '2026-01-15',
      currency: 'DOP',
      seller: { name: 'Despacho', taxId: '101010101' },
      buyer: { name: 'Cliente', taxId: '130000000' },
      lines: [],
    });
    expect(rec.format).toBe('ECF');
    expect(String((rec.payload as { ecfXml: string }).ecfXml)).toContain('<ECF>');
  });

  it('reporta LexNET como no disponible', () => {
    expect(dom.getCourtIntegration().available).toBe(false);
  });

  it('calcula plazos excluyendo solo fines de semana', () => {
    const r = dom.getProceduralDeadlines({
      startDate: '2026-01-02',
      days: 3,
      deadlineType: 'GENERIC',
    });
    expect(r.businessDays).toBe(true);
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('genera reportes 606/607 stubbeados', async () => {
    const reports = dom.getFiscalReports();
    expect(reports.supported).toEqual(['606', '607']);
    const out = await reports.generate('606', { period: '2026-01' });
    expect(out.format).toBe('CSV');
    expect(out.submission.status).toBe('STUBBED');
  });
});
