import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  computeInvoiceTotals,
  round2,
  type InvoiceLineInput,
  type InvoiceTotals,
  type TaxRate,
} from '@legalflow/compliance';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuSignerService } from './verifactu-signer.service';
import { buildRegistroAltaXml } from './registro-xml';

/** Datos de la emisión que necesita el registro AEAT (los aporta `LedgerService.emitInvoiceInTx`). */
export interface RegistroEmissionInput {
  nifEmisor: string;
  nombreRazonEmisor: string;
  numSerieFactura: string;
  /** Fecha de expedición ISO `yyyy-mm-dd`. */
  fechaExpedicion: string;
  destinatario: { nombreRazon: string; nif: string };
  /** Rectificativa (R1) que corrige una factura ya emitida; ausente → F1 normal. */
  rectificacion?: {
    tipoRectificativa: 'S' | 'I';
    rectifiedNumber: string;
    rectifiedIssueDate?: string;
    reason: string;
  };
  /** Líneas de la factura (mismas que la emisión) para el desglose por tipo impositivo. */
  lines: InvoiceLineInput[];
  /** Tasas del provider fiscal de la emisión (fuente única de la matemática). */
  rates: TaxRate[];
  /** Totales YA calculados por el provider (los mismos que se persisten en la factura). */
  totals: InvoiceTotals;
  /** Momento de generación del registro; inyectable para reproducibilidad en tests. */
  now?: Date;
}

export interface RegistroEmissionResult {
  /** XML del RegistroAlta — firmado XAdES-BES si el despacho tiene certificado. */
  xml: string;
  /** Huella AEAT de este registro (encadena el siguiente). */
  huella: string;
  /** CN del certificado firmante, o null si el registro quedó sin firma (sin certificado). */
  signedBy: string | null;
}

/**
 * Generación (+ firma) del registro de facturación Verifactu EN LA EMISIÓN. Se invoca DENTRO de la
 * transacción de emisión, bajo el advisory lock por tenant (espacio 2), por dos razones:
 *  - el XML/huella AEAT son parte del registro fiscal inalterable → deben nacer en el INSERT (el rol de
 *    app no tiene UPDATE sobre esas columnas después);
 *  - el encadenamiento AEAT (registro anterior) lee la última factura con `verifactuHuella` del tenant,
 *    y el lock garantiza que no hay dos emisiones encadenando contra el mismo anterior.
 * La firma carga el certificado del storage (fuera de BD): alarga unos ms el lock, aceptado a cambio de
 * la inalterabilidad del registro firmado.
 */
@Injectable()
export class VerifactuRegistroService {
  private readonly logger = new Logger(VerifactuRegistroService.name);

  constructor(
    private readonly config: VerifactuConfig,
    private readonly signer: VerifactuSignerService,
  ) {}

  async buildAndSign(
    tx: Prisma.TransactionClient,
    tenantId: string,
    p: RegistroEmissionInput,
  ): Promise<RegistroEmissionResult> {
    // Registro Verifactu anterior del despacho (encadenamiento AEAT, separado de la cadena interna).
    // Orden determinista (createdAt, id) — el mismo criterio que la cadena interna.
    const previous = await tx.invoice.findFirst({
      where: { tenantId, verifactuHuella: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { number: true, issueDate: true, verifactuHuella: true },
    });

    // Desglose por tipo impositivo: mismas líneas y mismo redondeo por línea que los totales de la
    // emisión (computeInvoiceTotals), agrupadas por tipo — así CuotaTotal = Σ cuotas del desglose exacto.
    const { lines } = computeInvoiceTotals(p.lines, p.rates);
    const byRate = new Map<number, { base: number; cuota: number }>();
    for (const l of lines) {
      const g = byRate.get(l.taxRatePercent) ?? { base: 0, cuota: 0 };
      g.base += l.base;
      g.cuota += l.taxAmount;
      byRate.set(l.taxRatePercent, g);
    }
    const desglose = [...byRate.entries()].map(([tipo, g]) => ({
      tipoImpositivo: tipo.toFixed(2),
      baseImponible: round2(g.base).toFixed(2),
      cuotaRepercutida: round2(g.cuota).toFixed(2),
    }));

    // ImporteTotal del registro AEAT = base + cuota. La retención IRPF NO se resta (criterio FAQ AEAT
    // sobre el contenido del registro); el total interno de la factura (con IRPF) no cambia.
    const importeTotal = round2(Number(p.totals.taxableBase) + Number(p.totals.taxAmount)).toFixed(
      2,
    );

    // Momento de generación con huso (xs:dateTime con offset). UTC explícito (+00:00 no Z): forma
    // pendiente de ratificar con el banco de pruebas.
    const now = p.now ?? new Date();
    const fechaHoraHusoGenRegistro = `${now.toISOString().slice(0, 19)}+00:00`;

    const { xml, huella } = buildRegistroAltaXml({
      nifEmisor: p.nifEmisor,
      nombreRazonEmisor: p.nombreRazonEmisor,
      numSerieFactura: p.numSerieFactura,
      fechaExpedicion: p.fechaExpedicion,
      tipoFactura: p.rectificacion ? 'R1' : 'F1',
      tipoRectificativa: p.rectificacion?.tipoRectificativa,
      facturasRectificadas: p.rectificacion
        ? [
            {
              numSerieFactura: p.rectificacion.rectifiedNumber,
              fechaExpedicion: p.rectificacion.rectifiedIssueDate ?? null,
            },
          ]
        : undefined,
      descripcionOperacion: p.rectificacion
        ? `Factura rectificativa: ${p.rectificacion.reason}`
        : 'Prestación de servicios de asistencia jurídica',
      destinatario: p.destinatario,
      desglose,
      cuotaTotal: p.totals.taxAmount,
      importeTotal,
      registroAnterior: previous?.verifactuHuella
        ? {
            // NIF actual del despacho: el emisor de la cadena es el mismo obligado tributario.
            nifEmisor: p.nifEmisor,
            numSerieFactura: previous.number,
            fechaExpedicion: previous.issueDate.toISOString().slice(0, 10),
            huella: previous.verifactuHuella,
          }
        : null,
      fechaHoraHusoGenRegistro,
      sistema: this.config.sistemaInformatico(tenantId),
    });

    // Firma XAdES-BES con el certificado del despacho, si lo tiene. Sin certificado (o si la firma
    // falla), el registro queda SIN firma — la emisión nunca se rompe por la firma; en modalidad
    // VERI*FACTU la remisión continua no exige firma del registro (RD 1007/2023 art. 10).
    let signedXml: string | null = null;
    let signedBy: string | null = null;
    try {
      const signed = await this.signer.signRecord(tenantId, xml, {
        signingTime: now,
        idSuffix: 'verifactu',
      });
      if (signed) {
        signedXml = signed.signedXml;
        signedBy = signed.signedBy;
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo firmar el registro Verifactu del tenant ${tenantId} (se emite sin firma): ${(err as Error).message}`,
      );
    }

    return { xml: signedXml ?? xml, huella, signedBy };
  }
}
