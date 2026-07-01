import type { WorkflowStep } from '@/lib/types';

/**
 * Helpers puros del builder de flujos (Zora workflows builder, LAW-67). Aislados de React para poder
 * probarlos sin montar componentes: la UI solo cablea estos resultados.
 */

/** Un paso en edición en el formulario: la tool + su input como texto JSON crudo (editable). */
export interface DraftStep {
  tool: string;
  /** Input del paso como JSON crudo. Vacío ⇒ `{}`. */
  inputText: string;
}

export type ParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: 'not_json' | 'not_object' };

/**
 * Parsea el input JSON de un paso. Un texto vacío equivale a `{}` (muchas tools no llevan argumentos).
 * Debe ser un OBJETO JSON (no array, no escalar): el backend espera `Record<string, unknown>`.
 */
export function parseStepInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'not_json' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'not_object' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export type BuildResult =
  | { ok: true; steps: WorkflowStep[] }
  | { ok: false; index: number; error: 'no_tool' | 'not_json' | 'not_object' };

/**
 * Convierte los pasos en edición a la forma que persiste el backend (`WorkflowStep[]`), validando cada uno:
 * debe tener tool seleccionada y un input JSON de objeto. Devuelve el primer paso inválido (índice + motivo)
 * para señalarlo en la UI.
 */
export function buildSteps(draft: DraftStep[]): BuildResult {
  const steps: WorkflowStep[] = [];
  for (let i = 0; i < draft.length; i++) {
    const d = draft[i];
    if (!d.tool) return { ok: false, index: i, error: 'no_tool' };
    const parsed = parseStepInput(d.inputText);
    if (!parsed.ok) return { ok: false, index: i, error: parsed.error };
    steps.push({ tool: d.tool, input: parsed.value });
  }
  return { ok: true, steps };
}

/** Serializa el input de un paso persistido a texto para editarlo (objeto vacío ⇒ cadena vacía). */
export function stepInputToText(input: Record<string, unknown>): string {
  if (!input || Object.keys(input).length === 0) return '';
  return JSON.stringify(input, null, 2);
}
