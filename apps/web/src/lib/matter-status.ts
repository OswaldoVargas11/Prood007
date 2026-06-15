import type { MatterStatus } from './types';
import type { BadgeProps } from '@/components/ui/badge';

/**
 * Espejo en cliente de la máquina de estados del expediente (la VERDAD está en el backend:
 * `apps/api/.../matter-status.ts`). Sirve para mostrar solo transiciones válidas en la UI; el
 * backend rechaza cualquier transición no permitida.
 */
export const MATTER_TRANSITIONS: Record<MatterStatus, MatterStatus[]> = {
  OPEN: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'CLOSED'],
  ON_HOLD: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: ['ARCHIVED', 'IN_PROGRESS'],
  ARCHIVED: [],
};

export const MATTER_STATUSES: MatterStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'CLOSED',
  'ARCHIVED',
];

/** Variante de Badge por estado (color semántico del design system). */
export function statusVariant(status: MatterStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'OPEN':
      return 'info';
    case 'IN_PROGRESS':
      return 'success';
    case 'ON_HOLD':
      return 'warning';
    case 'CLOSED':
      return 'secondary';
    case 'ARCHIVED':
      return 'outline';
  }
}

export function nextStatuses(status: MatterStatus): MatterStatus[] {
  return MATTER_TRANSITIONS[status] ?? [];
}
