import type {
  AiAssistantProvider,
  AiCitation,
  AiDraftRequest,
  AiEngine,
  AiResult,
  AiReviewRequest,
  AiSource,
  AiSummarizeRequest,
} from '@legalflow/domain';

/**
 * Implementación del contrato `AiAssistantProvider` (D-011) sobre un `AiEngine`. Mantiene la exigencia de
 * diseño: respuestas ANCLADAS en las fuentes, con CITAS y señales de fiabilidad (AI Act). El modelo cita
 * cada afirmación con `[[id]]`; aquí se extraen esas citas y se derivan confianza y advertencias.
 *
 * No es un sustituto del criterio del abogado: si no hay citas, se marca baja confianza y se avisa.
 */
const SYSTEM = [
  'Eres un asistente jurídico para un despacho de abogados (España y República Dominicana).',
  'Trabajas EXCLUSIVAMENTE con la información de las FUENTES que se te entregan.',
  'Reglas estrictas:',
  '1) No inventes hechos, fechas, nombres, importes ni citas legales que no estén en las fuentes.',
  '2) Cita la fuente de cada afirmación con el marcador [[id]] usando el id exacto de la fuente.',
  '3) Si la información necesaria NO está en las fuentes, dilo explícitamente en vez de suponerla.',
  '4) Responde en el idioma indicado, con tono profesional y preciso.',
  '5) Recuerda que es un borrador de apoyo: la decisión y la responsabilidad son del letrado.',
].join('\n');

export class AssistantProvider implements AiAssistantProvider {
  constructor(private readonly engine: AiEngine) {}

  async draft(req: AiDraftRequest): Promise<AiResult> {
    const user = [
      `Idioma de respuesta: ${req.locale}.`,
      'TAREA (redacción):',
      req.prompt,
      '',
      this.formatSources(req.sources),
    ].join('\n');
    return this.run(user, req.sources);
  }

  async summarize(req: AiSummarizeRequest): Promise<AiResult> {
    const user = [
      `Idioma de respuesta: ${req.locale}.`,
      'TAREA: Resume de forma fiel y estructurada el contenido de las fuentes. No añadas nada que no esté en ellas.',
      '',
      this.formatSources(req.sources),
    ].join('\n');
    return this.run(user, req.sources);
  }

  async review(req: AiReviewRequest): Promise<AiResult> {
    const user = [
      `Idioma de respuesta: ${req.locale}.`,
      'TAREA: Revisa el TEXTO siguiente apoyándote en las fuentes. Señala incoherencias, riesgos, cláusulas',
      'faltantes o afirmaciones no respaldadas. Sé concreto y cita las fuentes pertinentes.',
      '',
      '=== TEXTO A REVISAR ===',
      req.content,
      '',
      this.formatSources(req.sources),
    ].join('\n');
    return this.run(user, req.sources);
  }

  /** Formatea las fuentes en bloques citables `[[id]] título — excerpt`. */
  private formatSources(sources: AiSource[]): string {
    if (!sources.length) return 'FUENTES: (ninguna aportada)';
    const blocks = sources.map((s) => `[[${s.id}]] ${s.title ?? ''}\n${s.excerpt}`.trim());
    return ['FUENTES (cítalas por su id entre dobles corchetes):', ...blocks].join('\n\n');
  }

  private async run(userMessage: string, sources: AiSource[]): Promise<AiResult> {
    const completion = await this.engine.complete({
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });
    return this.toResult(completion.text, sources);
  }

  /** Extrae las citas `[[id]]` del texto y deriva confianza/advertencias. */
  private toResult(output: string, sources: AiSource[]): AiResult {
    const validIds = new Set(sources.map((s) => s.id));
    const cited = new Set<string>();
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(output)) !== null) {
      const id = (m[1] ?? '').trim();
      if (id && validIds.has(id)) cited.add(id);
    }
    const citations: AiCitation[] = [...cited].map((sourceId) => ({ sourceId }));

    const warnings: string[] = [];
    let confidence: number;
    if (sources.length === 0) {
      confidence = 0.3;
      warnings.push('Respuesta generada sin fuentes verificables; trátala como orientativa.');
    } else if (citations.length === 0) {
      confidence = 0.35;
      warnings.push('La respuesta no cita ninguna fuente: revisa manualmente antes de usarla.');
    } else {
      // Más fuentes citadas (sobre las aportadas) ⇒ mayor anclaje. Acotado a [0.5, 0.95].
      confidence = Math.min(0.95, 0.5 + 0.45 * (citations.length / sources.length));
    }

    return { output, citations, confidence, warnings };
  }
}
