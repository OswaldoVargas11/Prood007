/**
 * TaxSubmissionProviderFactory — selecciona el proveedor de ENVÍO del registro fiscal según la
 * jurisdicción del tenant (espejo de `ComplianceProviderFactory`). Único punto donde el núcleo
 * "elige organismo"; a partir de aquí todo opera contra la interfaz `TaxSubmissionProvider`.
 */
import { Jurisdiction } from '@legalflow/domain';
import type { TaxSubmissionProvider } from './submission.interface';
import { SpainTaxSubmissionProvider } from './providers/spain.submission';
import { DominicanTaxSubmissionProvider } from './providers/dominican.submission';

export class TaxSubmissionProviderFactory {
  private static readonly cache = new Map<Jurisdiction, TaxSubmissionProvider>();

  static get(jurisdiction: Jurisdiction): TaxSubmissionProvider {
    const cached = this.cache.get(jurisdiction);
    if (cached) return cached;

    let provider: TaxSubmissionProvider;
    switch (jurisdiction) {
      case Jurisdiction.ES:
        provider = new SpainTaxSubmissionProvider();
        break;
      case Jurisdiction.DO:
        provider = new DominicanTaxSubmissionProvider();
        break;
      default:
        throw new Error(
          `No hay TaxSubmissionProvider para la jurisdicción: ${jurisdiction as string}`,
        );
    }
    this.cache.set(jurisdiction, provider);
    return provider;
  }
}
