import { Injectable } from '@nestjs/common';
import { Jurisdiction } from '@legalflow/domain';
import { ComplianceProvider, ComplianceProviderFactory } from '@legalflow/compliance';

/**
 * ComplianceService — único punto del núcleo que obtiene un ComplianceProvider.
 *
 * El resto del núcleo (clientes, expedientes, ledger, facturación) NUNCA importa un provider
 * concreto ni conoce su país: pide aquí el provider para la jurisdicción del tenant en curso y
 * opera contra la interfaz. Así se respeta el principio "núcleo agnóstico + adaptadores".
 */
@Injectable()
export class ComplianceService {
  /** Resuelve el provider para una jurisdicción explícita. */
  forJurisdiction(jurisdiction: Jurisdiction): ComplianceProvider {
    return ComplianceProviderFactory.get(jurisdiction);
  }

  /**
   * Resuelve el provider a partir del tenant.
   * (En E1 el TenantContext aportará jurisdiction; aquí se acepta el dato ya resuelto para no
   * acoplar este servicio al modelo de persistencia.)
   */
  forTenant(tenant: { jurisdiction: Jurisdiction }): ComplianceProvider {
    return ComplianceProviderFactory.get(tenant.jurisdiction);
  }
}
