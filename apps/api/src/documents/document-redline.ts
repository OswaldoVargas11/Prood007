import { diffWords } from 'diff';

/**
 * Comparación de redline a nivel de palabra entre dos textos (versión base → versión nueva). Devuelve
 * segmentos estructurados (igual / añadido / eliminado) en lugar de HTML, para que el cliente los
 * pinte de forma segura (sin inyectar el contenido del documento como HTML).
 */

export type RedlineSegmentType = 'equal' | 'insert' | 'delete';

export interface RedlineSegment {
  type: RedlineSegmentType;
  value: string;
}

export interface RedlineResult {
  segments: RedlineSegment[];
  added: number;
  removed: number;
}

export function computeRedline(baseText: string, againstText: string): RedlineResult {
  const parts = diffWords(baseText, againstText);
  const segments: RedlineSegment[] = [];
  let added = 0;
  let removed = 0;

  for (const part of parts) {
    if (part.added) {
      segments.push({ type: 'insert', value: part.value });
      added += part.count ?? 0;
    } else if (part.removed) {
      segments.push({ type: 'delete', value: part.value });
      removed += part.count ?? 0;
    } else {
      segments.push({ type: 'equal', value: part.value });
    }
  }

  return { segments, added, removed };
}
