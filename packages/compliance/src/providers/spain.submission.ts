import { Jurisdiction } from '@legalflow/domain';
import type { TaxSubmissionProvider } from '../submission.interface';
import type { InvoiceRecord, SubmissionResult } from '../types';

/**
 * Identificador estable derivado del registro (idempotencia entre reintentos): mismo `recordHash`
 * → mismo `externalId`, de modo que reenviar no genere un alta duplicada en el organismo.
 */
export function deterministicExternalId(prefix: string, record: InvoiceRecord): string {
  const seed = record.recordHash ?? `${record.jurisdiction}:${record.format}`;
  const compact = seed
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 24)
    .toUpperCase();
  return `${prefix}-${compact || 'NA'}`;
}

/**
 * Envío del registro Verifactu a la AEAT (ES). STUB: NO transmite (devuelve `STUBBED`), pero con la
 * forma EXACTA del cliente real. Activar = sustituir el cuerpo por el cliente SOAP/REST de la AEAT
 * con el certificado del despacho. Ver `submission.interface.ts`.
 */
export class SpainTaxSubmissionProvider implements TaxSubmissionProvider {
  readonly jurisdiction = Jurisdiction.ES;
  readonly authority = 'AEAT';

  submit(record: InvoiceRecord): Promise<SubmissionResult> {
    return Promise.resolve({
      status: 'STUBBED',
      detail:
        'Alta Verifactu en AEAT no implementada (adaptador listo; requiere certificado + sandbox AEAT).',
      externalId: deterministicExternalId('AEAT', record),
      timestamp: new Date().toISOString(),
    });
  }

  getStatus(externalId: string): Promise<SubmissionResult> {
    return Promise.resolve({
      status: 'STUBBED',
      detail: 'Consulta de estado en AEAT no implementada (adaptador listo).',
      externalId,
      timestamp: new Date().toISOString(),
    });
  }
}
