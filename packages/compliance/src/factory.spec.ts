import { Jurisdiction } from '@legalflow/domain';
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
});
