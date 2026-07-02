import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';

/**
 * Primitivas de la cadena fiscal inmutable (FiscalEvent), compartidas entre la emisión (LedgerService)
 * y la transmisión e-CF a la DGII (EcfTransmissionService). Una ÚNICA implementación del encadenado:
 * dos copias podrían divergir y romper la verificabilidad de la cadena (verifyFiscalChain).
 */

// Huella de génesis de la cadena fiscal (RRSIF/e-CF): la primera factura/evento de un tenant encadena con
// 64 ceros, NO con cadena vacía. Convención única y documentada, alineada con los golden de conformance, de
// modo que la huella reproducible por un auditor coincida con la de producción.
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Serialización CANÓNICA (claves ordenadas recursivamente) para la huella de la cadena fiscal (L-5).
 *
 * El payload se guarda en una columna `jsonb`, que NO preserva el orden de claves ni el espaciado. Si la
 * huella se computa con `JSON.stringify(payload)` al escribir pero se recomputa sobre el `payload` releído
 * de jsonb al verificar, podían no coincidir byte a byte → falso "cadena rota". Ordenando las claves en
 * ambos lados la huella es reproducible independientemente del round-trip de jsonb.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Añade un evento al registro fiscal inmutable encadenándolo con la huella del evento anterior del tenant
 * (génesis = 64 ceros). Determinista por orden (createdAt, id). El rol de app solo tiene INSERT/SELECT.
 *
 * CONCURRENCIA: el llamador debe serializar por tenant (advisory lock de emisión
 * `pg_advisory_xact_lock(2, hashtext(tenantId))` dentro de la misma transacción); dos appends
 * concurrentes leerían la misma huella previa y bifurcarían la cadena.
 */
export async function appendFiscalEvent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  invoiceId: string | null,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const prev = await tx.fiscalEvent.findFirst({
    where: { tenantId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { recordHash: true },
  });
  const previousEventHash = prev?.recordHash ?? GENESIS_HASH;
  const canonical = [type, invoiceId ?? '', canonicalJson(payload), previousEventHash].join('|');
  const recordHash = createHash('sha256').update(canonical).digest('hex');
  await tx.fiscalEvent.create({
    data: {
      tenantId,
      invoiceId,
      type,
      payload: payload as object,
      recordHash,
      previousEventHash,
    },
  });
}
