/**
 * Lógica de dominio PURA del funds-flow / escrow (sin Prisma ni I/O): cuadre del closing statement por
 * moneda y derivación del estado de un depósito en garantía. Aislada para poder testearla sin BD.
 *
 * Trabaja en CÉNTIMOS enteros para evitar errores de coma flotante al sumar importes; expone las salidas
 * ya convertidas a unidades monetarias (números con 2 decimales).
 */

import { EscrowStatus } from '@legalflow/domain';

/** Importe (string decimal "1000.00" o número) → céntimos enteros. */
export function toCents(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Céntimos enteros → unidades monetarias (número con 2 decimales). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export interface FundsFlowLineInput {
  payerPartyId: string | null;
  payeePartyId: string | null;
  amount: string | number;
  currency: string;
}

/** Cuadre por moneda: lo que sale (con pagador) frente a lo que entra (con beneficiario). */
export interface CurrencyReconciliation {
  currency: string;
  /** Σ de importes con parte PAGADORA registrada (débitos / usos de fondos). */
  totalPaid: number;
  /** Σ de importes con parte BENEFICIARIA registrada (créditos / fuentes de fondos). */
  totalReceived: number;
  /** totalPaid − totalReceived. ≠ 0 ⇒ hay flujos sin contraparte registrada (descuadre). */
  imbalance: number;
  balanced: boolean;
}

/** Saldo de una parte en una moneda (lo pagado, lo recibido y el neto). */
export interface PartyBalance {
  partyId: string;
  currency: string;
  paid: number;
  received: number;
  /** received − paid. */
  net: number;
}

export interface FundsFlowReconciliation {
  byCurrency: CurrencyReconciliation[];
  byParty: PartyBalance[];
  /** true ⇔ todas las monedas cuadran (cada flujo que sale tiene un destino registrado). */
  balanced: boolean;
}

/**
 * Cuadra un funds-flow statement. Cada línea mueve `amount` de la parte pagadora a la beneficiaria:
 *  · suma a `totalPaid[moneda]` si hay pagador, a `totalReceived[moneda]` si hay beneficiario;
 *  · si una línea tiene pagador pero NO beneficiario (o viceversa) aparece como descuadre — es el aviso
 *    "dinero que sale sin destino registrado" que un abogado transaccional busca.
 * El cuadre es SIEMPRE por moneda: no se mezclan EUR con USD/DOP.
 */
export function reconcileFundsFlow(lines: FundsFlowLineInput[]): FundsFlowReconciliation {
  const currencies = new Map<string, { paid: number; received: number }>();
  // key = `${partyId}|${currency}`
  const parties = new Map<string, { partyId: string; currency: string; paid: number; received: number }>();

  const ensureCurrency = (currency: string) => {
    let c = currencies.get(currency);
    if (!c) {
      c = { paid: 0, received: 0 };
      currencies.set(currency, c);
    }
    return c;
  };
  const ensureParty = (partyId: string, currency: string) => {
    const key = `${partyId}|${currency}`;
    let p = parties.get(key);
    if (!p) {
      p = { partyId, currency, paid: 0, received: 0 };
      parties.set(key, p);
    }
    return p;
  };

  for (const line of lines) {
    const cents = toCents(line.amount);
    const cur = ensureCurrency(line.currency);
    if (line.payerPartyId) {
      cur.paid += cents;
      ensureParty(line.payerPartyId, line.currency).paid += cents;
    }
    if (line.payeePartyId) {
      cur.received += cents;
      ensureParty(line.payeePartyId, line.currency).received += cents;
    }
  }

  const byCurrency: CurrencyReconciliation[] = [...currencies.entries()]
    .map(([currency, { paid, received }]) => {
      const imbalance = paid - received;
      return {
        currency,
        totalPaid: fromCents(paid),
        totalReceived: fromCents(received),
        imbalance: fromCents(imbalance),
        balanced: imbalance === 0,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const byParty: PartyBalance[] = [...parties.values()]
    .map(({ partyId, currency, paid, received }) => ({
      partyId,
      currency,
      paid: fromCents(paid),
      received: fromCents(received),
      net: fromCents(received - paid),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.partyId.localeCompare(b.partyId));

  return { byCurrency, byParty, balanced: byCurrency.every((c) => c.balanced) };
}

export interface EscrowReleaseInput {
  amount: string | number;
}

export interface EscrowComputation {
  releasedCents: number;
  remainingCents: number;
  released: number;
  remaining: number;
  status: EscrowStatus;
}

/**
 * Deriva el estado de un depósito a partir del importe retenido y sus liberaciones:
 *  · sin liberar (o ≤ 0)        → HELD
 *  · liberado ≥ importe         → RELEASED
 *  · liberado parcial (0 < x)   → PARTIALLY_RELEASED
 * El remanente nunca es negativo (se acota a 0).
 */
export function computeEscrow(
  amount: string | number,
  releases: EscrowReleaseInput[],
): EscrowComputation {
  const amountCents = toCents(amount);
  const releasedCents = releases.reduce((sum, r) => sum + toCents(r.amount), 0);
  const remainingCents = Math.max(0, amountCents - releasedCents);

  let status: EscrowStatus;
  if (releasedCents <= 0) status = EscrowStatus.HELD;
  else if (releasedCents >= amountCents) status = EscrowStatus.RELEASED;
  else status = EscrowStatus.PARTIALLY_RELEASED;

  return {
    releasedCents,
    remainingCents,
    released: fromCents(releasedCents),
    remaining: fromCents(remainingCents),
    status,
  };
}

/** ¿Cabe liberar `requested` sin exceder el remanente disponible? (importes en céntimos). */
export function canRelease(remainingCents: number, requestedCents: number): boolean {
  return requestedCents > 0 && requestedCents <= remainingCents;
}
