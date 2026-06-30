/**
 * Lógica de dominio PURA del gating de Conditions Precedent (sin Prisma ni I/O): a partir de las partidas
 * de uno o varios checklists de cierre, deriva la "readiness" de la operación por fase (¿están satisfechas
 * las condiciones previas para firmar / cerrar?). Aislada para poder testearla sin BD — T-2.
 *
 * Una CP cuenta como satisfecha cuando su estado es SATISFIED (cumplida) o WAIVED (dispensada): ambas
 * desbloquean la fase. El resto (PENDING / IN_PROGRESS) queda pendiente.
 */

// Literales de Prisma (string-union; la salida de Prisma asigna a estos valores).
type ItemCategory = 'CONDITION_PRECEDENT' | 'DELIVERABLE' | 'SIGNATURE_PAGE' | 'OTHER';
type ItemStatus = 'PENDING' | 'IN_PROGRESS' | 'WAIVED' | 'SATISFIED';
type ItemPhase = 'AT_SIGNING' | 'AT_CLOSING' | 'POST_CLOSING';

/** Fases que actúan como "puerta" del cierre. POST_CLOSING son obligaciones posteriores, no gatean. */
export type GatingPhase = 'AT_SIGNING' | 'AT_CLOSING';
export const GATING_PHASES: GatingPhase[] = ['AT_SIGNING', 'AT_CLOSING'];

export interface ReadinessItemInput {
  category: ItemCategory;
  phase: ItemPhase;
  status: ItemStatus;
  title: string;
}

/** Readiness de una fase: cuántas CPs hay, cuántas satisfechas/dispensadas y cuáles quedan pendientes. */
export interface PhaseReadiness {
  phase: GatingPhase;
  /** Nº de CONDITION_PRECEDENT en la fase. */
  total: number;
  /** CPs en estado SATISFIED o WAIVED. */
  satisfied: number;
  /** CPs en estado WAIVED (subconjunto de satisfied) — dispensas explícitas. */
  waived: number;
  /** total − satisfied. */
  pending: number;
  /** Títulos de las CPs pendientes (para desglose/aviso en la UI). */
  pendingTitles: string[];
  /** % satisfecho (0–100). Sin CPs ⇒ 100 (vacuamente listo). */
  pct: number;
  /** true ⇔ no quedan CPs pendientes (incluye el caso "sin CPs"). */
  ready: boolean;
}

export interface ChecklistReadiness {
  byPhase: PhaseReadiness[];
}

function isSatisfied(status: ItemStatus): boolean {
  return status === 'SATISFIED' || status === 'WAIVED';
}

/**
 * Calcula la readiness por fase de gating (AT_SIGNING, AT_CLOSING) a partir de las partidas.
 * Sólo considera las de categoría CONDITION_PRECEDENT: son las que condicionan la firma/cierre.
 */
export function computeReadiness(items: ReadinessItemInput[]): ChecklistReadiness {
  const cps = items.filter((i) => i.category === 'CONDITION_PRECEDENT');
  const byPhase = GATING_PHASES.map<PhaseReadiness>((phase) => {
    const phaseCps = cps.filter((i) => i.phase === phase);
    const total = phaseCps.length;
    const satisfied = phaseCps.filter((i) => isSatisfied(i.status)).length;
    const waived = phaseCps.filter((i) => i.status === 'WAIVED').length;
    const pendingTitles = phaseCps.filter((i) => !isSatisfied(i.status)).map((i) => i.title);
    const pending = total - satisfied;
    return {
      phase,
      total,
      satisfied,
      waived,
      pending,
      pendingTitles,
      pct: total === 0 ? 100 : Math.round((satisfied / total) * 100),
      ready: pending === 0,
    };
  });
  return { byPhase };
}

/** Devuelve la readiness de una fase concreta (helper para el aviso al cerrar un hito). */
export function readinessForPhase(
  readiness: ChecklistReadiness,
  phase: GatingPhase,
): PhaseReadiness | undefined {
  return readiness.byPhase.find((p) => p.phase === phase);
}
