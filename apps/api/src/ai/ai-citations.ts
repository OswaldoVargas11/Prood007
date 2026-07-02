import type { AiToolOutcome } from '@legalflow/domain';

/**
 * Protocolo de CITAS VERIFICABLES del agente Zora (tendencia sector 2026: Shepard's Trust Markers,
 * Deep Research Verify). Toda afirmación factual del agente sobre expedientes/documentos debe poder
 * abrir su fuente. Este módulo es PURO (sin NestJS ni BD): se prueba offline.
 *
 * Cómo encaja: en el ENVOLTORIO común del executor del agente (`AiAgentService.runCore`), cada resultado
 * de herramienta pasa por `annotateWithCitations`, que (1) extrae referencias estructuradas del JSON que
 * devuelve la tool y (2) inyecta un marcador `cite`/`citation` en el propio contenido que ve el modelo,
 * para que este pueda citar con `[n]`. Las referencias acumuladas se persisten en `AiChatMessage.meta`
 * y la UI resuelve cada `[n]` contra `/ai/citations/resolve` (respetando permisos). No se tocan las 89
 * herramientas una a una: solo se enriquece aquí, en un único punto (salvo el RAG, que ya expone refId).
 */

/** Tipo de entidad citable (lo que el resolvedor sabe abrir respetando permisos). */
export type CitationKind = 'matter' | 'document' | 'client';

/** Una cita estructurada: marcador [n] ligado a una fuente resoluble. */
export interface Citation {
  /** Número del marcador [n] en la respuesta. */
  n: number;
  kind: CitationKind;
  /** Identificador resoluble por el resolvedor: referencia de expediente, id de documento, NIF/RNC. */
  refId: string;
  /** Etiqueta legible de la fuente (para la ficha del panel). */
  label: string;
  /** Fragmento textual citado (solo documentos/RAG): permite localizar y resaltar la cita. */
  quote?: string;
  /** Herramienta que produjo la cita (transparencia). */
  tool: string;
}

/** Candidato a cita antes de asignarle número (n). */
type Candidate = Omit<Citation, 'n'>;

/** Clave de deduplicación: misma entidad + mismo fragmento reutiliza el mismo [n]. */
function keyOf(c: { kind: string; refId: string; quote?: string }): string {
  return `${c.kind}:${c.refId}:${c.quote ?? ''}`;
}

/** Inserta el candidato en el registro (dedup) y devuelve su número [n]. */
function upsert(registry: Citation[], cand: Candidate): number {
  const key = keyOf(cand);
  const existing = registry.find((c) => keyOf(c) === key);
  if (existing) return existing.n;
  const n = registry.length + 1;
  registry.push({ n, ...cand });
  return n;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Extrae referencias del resultado de una herramienta y ANOTA el contenido con los marcadores de cita
 * (`citation` en fichas, `cite` por fila en listas) para que el modelo pueda citar con [n]. Acumula las
 * citas en `registry`. Nunca lanza: ante cualquier problema (contenido no-JSON, error de la tool) devuelve
 * el outcome intacto — la robustez del turno (el agente NUNCA da 500) manda sobre las citas.
 */
export function annotateWithCitations(
  toolName: string,
  outcome: AiToolOutcome,
  registry: Citation[],
): AiToolOutcome {
  if (outcome.isError) return outcome;
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(outcome.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return outcome;
    obj = parsed as Record<string, unknown>;
  } catch {
    return outcome; // No es JSON de objeto: sin cambios.
  }

  try {
    let touched = false;

    // ── Ficha de expediente (get_matter): { found:true, reference, title, ... } ──────────────────────
    if (obj.found !== false && isNonEmptyString(obj.reference)) {
      const label = isNonEmptyString(obj.title)
        ? `${obj.reference} — ${obj.title}`
        : String(obj.reference);
      obj.citation = upsert(registry, {
        kind: 'matter',
        refId: obj.reference,
        label,
        tool: toolName,
      });
      touched = true;
    }

    // ── Resultados anclados a un expediente por su referencia en `matter` (timeline, list_documents) ──
    if (obj.found !== false && isNonEmptyString(obj.matter) && obj.citation === undefined) {
      obj.citation = upsert(registry, {
        kind: 'matter',
        refId: obj.matter,
        label: String(obj.matter),
        tool: toolName,
      });
      touched = true;
    }

    // ── Listas de expedientes (search_matters, list_matters_by_status): matters[].reference ──────────
    if (Array.isArray(obj.matters)) {
      for (const it of obj.matters as Record<string, unknown>[]) {
        if (it && isNonEmptyString(it.reference)) {
          it.cite = upsert(registry, {
            kind: 'matter',
            refId: it.reference,
            label: isNonEmptyString(it.title) ? `${it.reference} — ${it.title}` : it.reference,
            tool: toolName,
          });
          touched = true;
        }
      }
    }

    // ── Fragmentos RAG citables (search_firm_knowledge): hits[] con refId + kind + excerpt ───────────
    if (Array.isArray(obj.hits)) {
      for (const it of obj.hits as Record<string, unknown>[]) {
        const kind = it?.kind === 'document' ? 'document' : it?.kind === 'matter' ? 'matter' : null;
        if (it && kind && isNonEmptyString(it.refId)) {
          it.cite = upsert(registry, {
            kind,
            refId: it.refId,
            label: isNonEmptyString(it.ref) ? it.ref : it.refId,
            quote: isNonEmptyString(it.excerpt) ? it.excerpt : undefined,
            tool: toolName,
          });
          touched = true;
        }
      }
    }

    // ── Clientes (find_client): clients[] con taxId/name ─────────────────────────────────────────────
    if (Array.isArray(obj.clients)) {
      for (const it of obj.clients as Record<string, unknown>[]) {
        const refId = isNonEmptyString(it?.taxId)
          ? it.taxId
          : isNonEmptyString(it?.name)
            ? it.name
            : null;
        if (it && refId) {
          it.cite = upsert(registry, {
            kind: 'client',
            refId,
            label: isNonEmptyString(it.name) ? it.name : refId,
            tool: toolName,
          });
          touched = true;
        }
      }
    }

    if (!touched) return outcome;
    return { content: JSON.stringify(obj), isError: outcome.isError };
  } catch {
    return outcome; // Nunca romper el turno por las citas.
  }
}

// ── Verificador post-respuesta (opcional, gated AI_CITATION_CHECK) ─────────────────────────────────────
// Segunda pasada BARATA (modelo económico tipo Haiku) que marca las afirmaciones factuales SIN cita o
// cuya cita no las soporta. No bloquea la respuesta: solo señala "sin verificar" en la UI. Puro aquí; la
// llamada al modelo la hace el servicio.

/** Prompt de sistema del verificador: estricto, binario, JSON. */
export const CITATION_CHECK_SYSTEM = [
  'Eres un VERIFICADOR de citas de un asistente jurídico. Recibes la respuesta final del asistente y la',
  'lista de fuentes citadas (cada una con su número [n], tipo, etiqueta y, si aplica, el fragmento citado).',
  'Tu tarea: detectar AFIRMACIONES FACTUALES CONCRETAS sobre expedientes, clientes, documentos, fechas,',
  'importes o hitos que (a) NO llevan ningún marcador [n], o (b) llevan un [n] cuyo fragmento/fuente NO',
  'respalda la afirmación. Ignora saludos, ofrecimientos, preguntas y generalidades. Responde SOLO JSON:',
  '{"verified": boolean, "flagged": string[]}. "verified" es true si no hay afirmaciones sin respaldo.',
  '"flagged" lista, en pocas palabras cada una, las afirmaciones problemáticas (máximo 5).',
].join('\n');

/** Construye el mensaje de usuario del verificador (determinista: sin timestamps). */
export function buildCitationCheckUser(answer: string, citations: Citation[]): string {
  const sources = citations.length
    ? citations
        .map(
          (c) =>
            `[${c.n}] (${c.kind}) ${c.label}${c.quote ? ` — fragmento: "${c.quote.slice(0, 240)}"` : ''}`,
        )
        .join('\n')
    : '(ninguna)';
  return [
    'RESPUESTA DEL ASISTENTE:',
    '"""',
    answer.slice(0, 4000),
    '"""',
    '',
    'FUENTES CITADAS:',
    sources,
    '',
    'Devuelve SOLO el JSON {"verified": boolean, "flagged": string[]}.',
  ].join('\n');
}

/** Resultado del verificador de citas. */
export interface CitationCheck {
  verified: boolean;
  flagged: string[];
}

/**
 * Parsea (con tolerancia) la salida del verificador. Salida NO parseable → `null` (estado desconocido):
 * un modelo ligero degradado no debe manifestarse como "verificado" positivo — sin JSON válido no hubo
 * verificación, y el llamador lo trata igual que un fallo del motor (sin marca).
 */
export function parseCitationCheck(text: string): CitationCheck | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      verified?: unknown;
      flagged?: unknown;
    };
    const flagged = Array.isArray(obj.flagged)
      ? obj.flagged
          .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
          .slice(0, 5)
      : [];
    const verified = typeof obj.verified === 'boolean' ? obj.verified : flagged.length === 0;
    return { verified, flagged };
  } catch {
    return null;
  }
}
