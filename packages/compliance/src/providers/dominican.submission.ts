import { Jurisdiction } from '@legalflow/domain';
import type { TaxSubmissionProvider } from '../submission.interface';
import type { InvoiceRecord, SubmissionResult } from '../types';
import { deterministicExternalId } from './spain.submission';

/**
 * Emisión del e-CF a la DGII (RD). STUB: NO transmite (devuelve `STUBBED`), con la forma EXACTA del
 * cliente real. Activar = sustituir el cuerpo por el cliente de recepción/acuse de la DGII.
 */
export class DominicanTaxSubmissionProvider implements TaxSubmissionProvider {
  readonly jurisdiction = Jurisdiction.DO;
  readonly authority = 'DGII';

  submit(record: InvoiceRecord): Promise<SubmissionResult> {
    return Promise.resolve({
      status: 'STUBBED',
      detail:
        'Emisión e-CF a la DGII no implementada (adaptador listo; requiere certificado + recepción DGII).',
      externalId: deterministicExternalId('DGII', record),
      timestamp: new Date().toISOString(),
    });
  }

  getStatus(externalId: string): Promise<SubmissionResult> {
    return Promise.resolve({
      status: 'STUBBED',
      detail: 'Consulta de estado en DGII no implementada (adaptador listo).',
      externalId,
      timestamp: new Date().toISOString(),
    });
  }
}
