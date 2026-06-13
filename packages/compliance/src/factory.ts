/**
 * ComplianceProviderFactory — selecciona la implementación de ComplianceProvider según la
 * jurisdicción del tenant. Es el ÚNICO punto donde el núcleo "elige país"; a partir de aquí
 * todo se opera contra la interfaz.
 *
 * Para añadir un tercer país: implementar un nuevo provider y registrarlo aquí. Nada más.
 */
import { Jurisdiction } from '@legalflow/domain';
import type { ComplianceProvider } from './provider.interface.js';
import { SpainComplianceProvider } from './providers/spain.provider.js';
import { DominicanComplianceProvider } from './providers/dominican.provider.js';

export class ComplianceProviderFactory {
  /** Cache de instancias (los providers son stateless). */
  private static readonly cache = new Map<Jurisdiction, ComplianceProvider>();

  static get(jurisdiction: Jurisdiction): ComplianceProvider {
    const cached = this.cache.get(jurisdiction);
    if (cached) return cached;

    let provider: ComplianceProvider;
    switch (jurisdiction) {
      case Jurisdiction.ES:
        provider = new SpainComplianceProvider();
        break;
      case Jurisdiction.DO:
        provider = new DominicanComplianceProvider();
        break;
      default:
        // exhaustividad: si se añade una jurisdicción al enum sin provider, falla en compilación.
        throw new Error(`No hay ComplianceProvider para la jurisdicción: ${jurisdiction as string}`);
    }
    this.cache.set(jurisdiction, provider);
    return provider;
  }
}
