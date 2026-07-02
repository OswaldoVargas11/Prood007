import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { VerifactuStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { appendFiscalEvent } from '../ledger/fiscal-chain';
import { apiError } from '../common/api-messages';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuClient, type VerifactuLineaResult } from './verifactu.client';

export interface VerifactuTransmitResult {
  status: VerifactuStatus;
  detail?: string | null;
  csv?: string | null;
}

/** Estados finales: el registro ya tiene acuse de la AEAT; no se vuelve a remitir (idempotencia). */
const FINAL_STATES: VerifactuStatus[] = [
  VerifactuStatus.ACCEPTED,
  VerifactuStatus.ACCEPTED_WITH_ERRORS,
  VerifactuStatus.REJECTED,
];

/**
 * Remisión del registro de facturación Verifactu a la AEAT (modalidad VERI*FACTU, RD 1007/2023 + Orden
 * HAC/1177/2024), siguiendo el patrón de `EcfTransmissionService` (DGII):
 *  - GATED: sin `VERIFACTU_ENV` o sin certificado del despacho NO se transmite nada (queda el detalle).
 *  - Se remite el XML PERSISTIDO en la emisión (nunca se regenera: huella y firma son inalterables).
 *  - Fallo de TRANSPORTE → sigue PENDING (el cron reintenta); el acuse de la AEAT (Correcto /
 *    AceptadoConErrores / Incorrecto) es el estado final y se persiste con su CSV.
 *  - Cada acuse final se anota en la cadena de eventos fiscal append-only (`FiscalEvent`), bajo el
 *    advisory lock de emisión del tenant para no bifurcar el encadenado.
 */
@Injectable()
export class VerifactuSubmissionService {
  private readonly logger = new Logger(VerifactuSubmissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: VerifactuConfig,
    private readonly credentials: VerifactuCredentialService,
  ) {}

  /** Remite el registro de una factura VERIFACTU. Best-effort: nunca lanza por un rechazo de la AEAT. */
  async transmit(tenantId: string, invoiceId: string): Promise<VerifactuTransmitResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        number: true,
        complianceFormat: true,
        verifactuXml: true,
        verifactuStatus: true,
      },
    });
    if (!invoice) throw new NotFoundException(apiError('ledger.invoiceNotFound'));
    // Sin registro AEAT (factura e-CF, o ES anterior a la generación del registro): no aplica.
    if (invoice.complianceFormat !== 'VERIFACTU' || !invoice.verifactuXml) {
      return { status: VerifactuStatus.NOT_APPLICABLE };
    }
    // Acuse ya recibido: no se re-remite (idempotencia del cron y de reintentos manuales).
    if (FINAL_STATES.includes(invoice.verifactuStatus)) {
      return { status: invoice.verifactuStatus };
    }

    if (!this.config.enabled) {
      const detail = 'Remisión a la AEAT apagada (define VERIFACTU_ENV).';
      await this.updateLifecycle(tenantId, invoiceId, { verifactuStatusDetail: detail });
      return { status: invoice.verifactuStatus, detail };
    }
    const cert = await this.credentials.loadCert(tenantId).catch(() => null);
    if (!cert) {
      const detail =
        'El despacho no tiene certificado .p12 de Verifactu: la remisión requiere TLS mutuo con la AEAT.';
      await this.updateLifecycle(tenantId, invoiceId, { verifactuStatusDetail: detail });
      return { status: invoice.verifactuStatus, detail };
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, taxId: true },
    });

    let linea: VerifactuLineaResult | undefined;
    let csv: string | null = null;
    let estadoEnvio: string;
    try {
      const result = await new VerifactuClient(this.config).submitRegistros(
        { nif: tenant.taxId ?? '', nombreRazon: tenant.name },
        [invoice.verifactuXml],
        cert,
      );
      estadoEnvio = result.estadoEnvio;
      csv = result.csv;
      linea = result.lineas[0];
    } catch (err) {
      // Fallo de TRANSPORTE (red/timeout/fault), no un rechazo: sigue PENDING y el cron reintenta.
      const detail = `Error remitiendo a la AEAT (se reintentará): ${(err as Error).message}`;
      await this.updateLifecycle(tenantId, invoiceId, {
        verifactuStatusDetail: detail.slice(0, 1000),
        verifactuAttempts: { increment: 1 },
      });
      return { status: VerifactuStatus.PENDING, detail };
    }

    const { status, detail } = mapAcuse(estadoEnvio, linea);
    // Estado + acuse en la cadena de eventos fiscal, atómicos y serializados por el advisory lock de
    // emisión (espacio 2): un append concurrente con una emisión bifurcaría el encadenado de eventos.
    await tenantTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${tenantId}))`;
      await tx.invoice.updateMany({
        // Guard sobre estados no finales: si otro proceso ya persistió un acuse, este no lo pisa.
        where: { id: invoiceId, tenantId, verifactuStatus: { notIn: FINAL_STATES } },
        data: {
          verifactuStatus: status,
          verifactuStatusDetail: detail,
          verifactuCsv: csv,
          verifactuSubmittedAt: new Date(),
          verifactuAttempts: 0,
        },
      });
      await appendFiscalEvent(
        tx,
        tenantId,
        invoiceId,
        status === VerifactuStatus.REJECTED ? 'verifactu.rejected' : 'verifactu.transmitted',
        {
          number: invoice.number,
          env: this.config.env,
          estadoEnvio,
          estadoRegistro: linea?.estadoRegistro ?? null,
          csv,
          codigoError: linea?.codigoError ?? null,
          descripcionError: linea?.descripcionError ?? null,
        },
      );
    });
    this.logger.log(
      `Registro Verifactu ${invoice.number} remitido a la AEAT (${this.config.env}): ${status}`,
    );
    return { status, detail, csv };
  }

  /** Actualiza solo columnas de ciclo de vida (las únicas con UPDATE para el rol de app). */
  private async updateLifecycle(
    tenantId: string,
    invoiceId: string,
    data: {
      verifactuStatusDetail?: string;
      verifactuAttempts?: { increment: number };
    },
  ): Promise<void> {
    await this.prisma.invoice.updateMany({ where: { id: invoiceId, tenantId }, data });
  }
}

/** Mapea el acuse de la AEAT a nuestro estado. Exportado para test. */
export function mapAcuse(
  estadoEnvio: string,
  linea: VerifactuLineaResult | undefined,
): { status: VerifactuStatus; detail: string | null } {
  const estado = (linea?.estadoRegistro ?? estadoEnvio).toLowerCase();
  const errorTxt = [linea?.codigoError, linea?.descripcionError].filter(Boolean).join(' — ');
  if (estado === 'correcto') return { status: VerifactuStatus.ACCEPTED, detail: null };
  if (estado === 'aceptadoconerrores') {
    return { status: VerifactuStatus.ACCEPTED_WITH_ERRORS, detail: errorTxt || null };
  }
  // Registro duplicado (ya remitido en un intento anterior cuyo acuse se perdió): para la AEAT ya está
  // registrado → se considera aceptado con aviso, no un rechazo. Código pendiente de ratificar con el
  // banco de pruebas (validaciones Verifactu, duplicados ~3000).
  if (linea?.codigoError === '3000' || estado.includes('duplicado')) {
    return {
      status: VerifactuStatus.ACCEPTED_WITH_ERRORS,
      detail: `Registro ya remitido previamente (duplicado). ${errorTxt}`.trim(),
    };
  }
  return {
    status: VerifactuStatus.REJECTED,
    detail: errorTxt || `Envío ${estadoEnvio}: registro rechazado por la AEAT.`,
  };
}
