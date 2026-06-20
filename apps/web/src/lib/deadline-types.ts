/**
 * Catálogo de plazos procesales comunes por jurisdicción, con días por defecto. Es una AYUDA: el
 * usuario puede editar los días y el concepto (los plazos legales dependen del procedimiento y deben
 * verificarse). El cómputo (días hábiles + festivos) lo hace el backend.
 */
export interface DeadlinePreset {
  /** Concepto que se guardará como `deadlineType` (texto). */
  label: string;
  /** Días por defecto (editable en el formulario). */
  days: number;
}

export const DEADLINE_PRESETS: Record<'es' | 'do', DeadlinePreset[]> = {
  es: [
    { label: 'Recurso de reposición', days: 5 },
    { label: 'Recurso de apelación', days: 20 },
    { label: 'Recurso de casación', days: 20 },
    { label: 'Contestación a la demanda', days: 20 },
    { label: 'Subsanación / requerimiento', days: 10 },
    { label: 'Alegaciones', days: 10 },
    { label: 'Personación', days: 20 },
  ],
  do: [
    { label: 'Recurso de apelación', days: 30 },
    { label: 'Oposición', days: 15 },
    { label: 'Réplica', days: 15 },
    { label: 'Recurso de casación', days: 30 },
    { label: 'Constitución de abogado', days: 15 },
  ],
};
