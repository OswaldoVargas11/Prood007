/**
 * AiAssistantProvider — CONTRATO ÚNICAMENTE (sin implementación en el MVP).
 *
 * Redacción / resumen / revisión documental con citación obligatoria de fuentes y control de
 * alucinaciones. El diseño exige `sources` y devuelve señales de confianza y citas, alineado con
 * la trazabilidad que requerirá el AI Act europeo. No se cablea aún (ver DECISIONS D-011).
 */
export interface AiSource {
  /** Identificador del documento/fragmento citable (p. ej. documentId o URL interna). */
  id: string;
  title?: string;
  /** Fragmento textual en el que se apoya la respuesta. */
  excerpt: string;
}

export interface AiCitation {
  sourceId: string;
  /** Localización dentro de la fuente (página, offset…). */
  locator?: string;
}

export interface AiResult {
  output: string;
  /** Citas que respaldan el output; vacío debe tratarse como señal de baja fiabilidad. */
  citations: AiCitation[];
  /** Confianza estimada [0,1]. */
  confidence: number;
  /** Indicadores de posible alucinación (afirmaciones sin cita, etc.). */
  warnings: string[];
}

export interface AiDraftRequest {
  prompt: string;
  sources: AiSource[];
  locale: string;
}

export interface AiSummarizeRequest {
  sources: AiSource[];
  locale: string;
}

export interface AiReviewRequest {
  /** Texto a revisar. */
  content: string;
  sources: AiSource[];
  locale: string;
}

export interface AiAssistantProvider {
  draft(req: AiDraftRequest): Promise<AiResult>;
  summarize(req: AiSummarizeRequest): Promise<AiResult>;
  review(req: AiReviewRequest): Promise<AiResult>;
}

export const AI_ASSISTANT_PROVIDER = Symbol('AI_ASSISTANT_PROVIDER');
