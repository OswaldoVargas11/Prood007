import { BadRequestException, Injectable } from '@nestjs/common';
import { Currency, Jurisdiction } from '@legalflow/domain';
import { apiError } from '../../common/api-messages';
import { LedgerService } from '../../ledger/ledger.service';
import { DgiiConfig } from '../dgii.config';
import { DgiiCredentialService } from '../dgii-credential.service';
import { EcfTransmissionService } from '../ecf-transmission.service';
import type { RequestUser } from '../../auth/auth.types';
import { RunCertificationDto } from './dto/run-certification.dto';

/** Resultado de un escenario del simulacro (estado tras emitir + primer intento de acuse). */
export interface CertificationScenarioResult {
  scenario: string;
  invoiceId: string;
  number: string;
  ecfStatus: string;
  ecfTrackId: string | null;
  ecfStatusDetail: string | null;
}

/**
 * Simulacro del set de e-CF de prueba que exige el kit de certificación de la DGII (CerteCF): emite por
 * el flujo REAL de emisión (misma numeración eNCF, cadena, firma y transmisión que producción — sin
 * atajos) los tipos de comprobante que la plataforma emite: 31 (crédito fiscal, con y sin multilínea)
 * y 34 (nota de crédito vía rectificativa). El acuse final lo sigue el cron de polling; el detalle por
 * factura queda visible en su ficha.
 *
 * GATED: requiere DGII_ENV activo y NO `prod` (el set de pruebas jamás contra producción), y el
 * certificado .p12 del despacho cargado. El kit vigente puede exigir escenarios adicionales
 * (ver docs/fiscal/DGII-ECF-CERTIFICACION.md): este comando cubre los tipos que Lawzora emite hoy.
 */
@Injectable()
export class EcfCertificationService {
  constructor(
    private readonly config: DgiiConfig,
    private readonly ledger: LedgerService,
    private readonly transmission: EcfTransmissionService,
    private readonly credentials: DgiiCredentialService,
  ) {}

  async run(user: RequestUser, dto: RunCertificationDto) {
    if (!this.config.enabled || this.config.env === 'prod') {
      throw new BadRequestException(apiError('dgii.certRunEnvInvalid'));
    }
    const cert = await this.credentials.getCert(user.tenantId);
    if (!cert) {
      throw new BadRequestException(apiError('dgii.certRunNoCert'));
    }

    const results: CertificationScenarioResult[] = [];
    const emit = async (
      scenario: string,
      lines: { description: string; quantity: string; unitPrice: string; taxCode: string }[],
    ) => {
      const { invoice } = await this.ledger.createInvoice(user, {
        matterId: dto.matterId,
        invoiceFormat: Jurisdiction.DO,
        currency: Currency.DOP,
        lines,
      });
      return invoice;
    };

    // 31 · crédito fiscal, servicio gravado ITBIS 18 % (caso base del emisor de servicios jurídicos).
    const simple = await emit('31 · crédito fiscal (servicio gravado)', [
      {
        description: 'Simulacro DGII: honorarios profesionales',
        quantity: '1',
        unitPrice: '10000.00',
        taxCode: 'ITBIS_STANDARD',
      },
    ]);
    // 31 · crédito fiscal multilínea (varias partidas gravadas en un mismo e-CF).
    const multi = await emit('31 · crédito fiscal (multilínea)', [
      {
        description: 'Simulacro DGII: estudio y redacción de contrato',
        quantity: '2',
        unitPrice: '3500.00',
        taxCode: 'ITBIS_STANDARD',
      },
      {
        description: 'Simulacro DGII: representación en audiencia',
        quantity: '1',
        unitPrice: '8000.00',
        taxCode: 'ITBIS_STANDARD',
      },
    ]);
    // 34 · nota de crédito: rectificativa que reversa el primer e-CF (flujo real de corrección).
    const { invoice: nota } = await this.ledger.rectifyInvoice(user, simple.id, {
      reason: 'Simulacro de certificación DGII: nota de crédito (tipo 34).',
    });

    // Primer intento de acuse de cada envío (best-effort; el cron sigue el polling hasta el final).
    for (const inv of [simple, multi, nota]) {
      await this.transmission.refresh(user.tenantId, inv.id).catch(() => null);
    }
    const scenarios: [string, string][] = [
      ['31 · crédito fiscal (servicio gravado)', simple.id],
      ['31 · crédito fiscal (multilínea)', multi.id],
      ['34 · nota de crédito (rectificativa)', nota.id],
    ];
    for (const [scenario, invoiceId] of scenarios) {
      const row = await this.ledger.getInvoice(user, invoiceId);
      results.push({
        scenario,
        invoiceId,
        number: row.number,
        ecfStatus: row.ecfStatus,
        ecfTrackId: row.ecfTrackId,
        ecfStatusDetail: row.ecfStatusDetail,
      });
    }
    return { env: this.config.env, scenarios: results };
  }
}
