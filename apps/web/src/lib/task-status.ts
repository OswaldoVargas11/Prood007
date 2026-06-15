import type { TaskStatus } from './types';
import type { BadgeProps } from '@/components/ui/badge';

export const TASK_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

export function taskStatusVariant(status: TaskStatus): NonNullable<BadgeProps['variant']> {
  switch (status) {
    case 'TODO':
      return 'secondary';
    case 'IN_PROGRESS':
      return 'info';
    case 'DONE':
      return 'success';
    case 'CANCELLED':
      return 'outline';
  }
}

/** true si la tarea está vencida (fecha pasada y no resuelta). */
export function isOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === 'DONE' || status === 'CANCELLED') return false;
  return new Date(dueDate).getTime() < Date.now();
}
