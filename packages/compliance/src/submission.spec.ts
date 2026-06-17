import { Jurisdiction } from '@legalflow/domain';
import { TaxSubmissionProviderFactory } from './submission.factory';
import { SpainTaxSubmissionProvider, deterministicExternalId } from './providers/spain.submission';
import { DominicanTaxSubmissionProvider } from './providers/dominican.submission';
import type { InvoiceRecord } from './types';

function record(jur: Jurisdiction, recordHash?: string): InvoiceRecord {
  return {
    jurisdiction: jur,
    format: jur === Jurisdiction.ES ? 'VERIFACTU' : 'ECF',
    totals: {} as InvoiceRecord['totals'],
    payload: {},
    recordHash,
    submission: { status: 'STUBBED' },
  };
}

describe('TaxSubmissionProvider (adaptador de envío, stub sin transmisión)', () => {
  it('la factory devuelve el proveedor por jurisdicción (cacheado) con su organismo', () => {
    const es = TaxSubmissionProviderFactory.get(Jurisdiction.ES);
    const doProv = TaxSubmissionProviderFactory.get(Jurisdiction.DO);
    expect(es).toBeInstanceOf(SpainTaxSubmissionProvider);
    expect(es.authority).toBe('AEAT');
    expect(doProv).toBeInstanceOf(DominicanTaxSubmissionProvider);
    expect(doProv.authority).toBe('DGII');
    // Cache: misma instancia en una segunda llamada.
    expect(TaxSubmissionProviderFactory.get(Jurisdiction.ES)).toBe(es);
  });

  it('la factory lanza ante una jurisdicción desconocida', () => {
    expect(() => TaxSubmissionProviderFactory.get('xx' as Jurisdiction)).toThrow(
      /TaxSubmissionProvider/,
    );
  });

  it('ES: submit no transmite (STUBBED) pero devuelve la forma completa', async () => {
    const res = await TaxSubmissionProviderFactory.get(Jurisdiction.ES).submit(
      record(Jurisdiction.ES, 'abc123'),
    );
    expect(res.status).toBe('STUBBED');
    expect(res.detail).toMatch(/AEAT/);
    expect(res.externalId).toMatch(/^AEAT-/);
    expect(typeof res.timestamp).toBe('string');
  });

  it('RD: submit no transmite (STUBBED) y getStatus conserva el externalId', async () => {
    const provider = TaxSubmissionProviderFactory.get(Jurisdiction.DO);
    const res = await provider.submit(record(Jurisdiction.DO, 'xyz789'));
    expect(res.status).toBe('STUBBED');
    expect(res.externalId).toMatch(/^DGII-/);
    const status = await provider.getStatus(res.externalId!);
    expect(status.status).toBe('STUBBED');
    expect(status.externalId).toBe(res.externalId);
  });

  it('externalId es idempotente por recordHash (mismo registro → mismo id) y tolera hash ausente', async () => {
    const a = await new SpainTaxSubmissionProvider().submit(record(Jurisdiction.ES, 'same-hash'));
    const b = await new SpainTaxSubmissionProvider().submit(record(Jurisdiction.ES, 'same-hash'));
    expect(a.externalId).toBe(b.externalId);
    // Sin recordHash: deriva un id estable de la jurisdicción/formato (no rompe).
    expect(deterministicExternalId('AEAT', record(Jurisdiction.ES))).toMatch(/^AEAT-/);
  });
});
