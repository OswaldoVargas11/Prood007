import { MatterStatus } from '@legalflow/domain';

/**
 * Máquina de estados del expediente (agnóstica de jurisdicción).
 * Define qué transiciones son válidas; cualquier otra se rechaza.
 */
export const MATTER_TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  [MatterStatus.OPEN]: [MatterStatus.IN_PROGRESS, MatterStatus.ON_HOLD, MatterStatus.CLOSED],
  [MatterStatus.IN_PROGRESS]: [MatterStatus.ON_HOLD, MatterStatus.CLOSED],
  [MatterStatus.ON_HOLD]: [MatterStatus.IN_PROGRESS, MatterStatus.CLOSED],
  [MatterStatus.CLOSED]: [MatterStatus.ARCHIVED, MatterStatus.IN_PROGRESS], // reapertura
  [MatterStatus.ARCHIVED]: [], // estado terminal
};

export function canTransition(from: MatterStatus, to: MatterStatus): boolean {
  return MATTER_TRANSITIONS[from]?.includes(to) ?? false;
}
