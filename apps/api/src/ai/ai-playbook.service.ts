import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_ENGINE,
  STORAGE_PROVIDER,
  type AiEngine,
  type StorageProvider,
} from '@legalflow/domain';
import type { Playbook, PlaybookReview, PlaybookReviewFinding, PlaybookRule } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AiQuotaService } from './ai-quota.service';
import { apiError } from '../common/api-messages';
import { extractText, isExtractableMime } from '../documents/text-extract';
import { locateQuote } from './ai-tabular.service';
import { playbookSeedFor } from './ai-playbook.seeds';
import { buildPlaybookReviewPdf } from './ai-playbook-pdf';
import type { CreatePlaybookDto, CreatePlaybookReviewDto, UpdatePlaybookDto } from './dto/ai.dto';
import type { RequestUser } from '../auth/auth.types';

/** Veredicto del revisor, ya normalizado (forma validada; la CITA aún sin verificar contra el texto). */
export interface PlaybookVerdict {
  outcome: 'compliant' | 'deviation' | 'missing';
  quote: string | null;
  analysis: string;
  dealBreaker: boolean;
  confidence: 'alta' | 'media' | 'baja';
}

/**
 * Prompt del REVISOR de playbook. Mismo guardrail anti-invención doble que la revisión tabular:
 * (1) todo veredicto sobre el texto (cumple/desviación) exige una cita LITERAL, que se VERIFICA después
 * en servidor (`locateQuote`) — sin ancla comprobada el veredicto no se persiste; y (2) si el contrato
 * NO trata el tema, debe decir "missing" (ausente) sin cita — nunca rellenarlo con conocimiento externo.
 */
const REVIEWER_SYSTEM =
  'Eres un revisor de contratos para un despacho de abogados. Recibirás el TEXTO de un contrato entrante ' +
  'y UNA regla del playbook del despacho: un tema (p. ej. limitación de responsabilidad), la posición ' +
  'PREFERIDA del despacho, las posiciones ACEPTABLES y las posiciones INACEPTABLES (deal-breakers). ' +
  'Debes dictaminar cómo trata el contrato ese tema respecto de la posición del despacho.\n\n' +
  'Responde SOLO con un objeto JSON válido, sin markdown ni texto adicional, con esta forma exacta:\n' +
  '{"outcome": "compliant"|"deviation"|"missing", "quote": string|null, "analysis": string, ' +
  '"dealBreaker": true|false, "confidence": "alta"|"media"|"baja"}\n\n' +
  'Reglas ESTRICTAS:\n' +
  '- "outcome": "compliant" si el pasaje del contrato coincide en lo sustancial con la posición preferida ' +
  'o encaja en las posiciones aceptables; "deviation" si el contrato TRATA el tema pero se aparta de la ' +
  'posición del despacho; "missing" si el contrato NO trata el tema en absoluto.\n' +
  '- "quote": una cita LITERAL copiada carácter a carácter del texto del contrato (máximo 600 caracteres) ' +
  'con el pasaje que fundamenta el veredicto. OBLIGATORIA si outcome es "compliant" o "deviation"; sin ' +
  'cita literal esos veredictos no son válidos. Si outcome es "missing", "quote" debe ser null.\n' +
  '- Si el tema NO aparece en el contrato, devuelve outcome "missing" con quote null. NUNCA lo rellenes ' +
  'con conocimiento externo, cláusulas típicas ni suposiciones: solo cuenta lo que está escrito.\n' +
  '- "analysis": 1 a 3 frases explicando el veredicto (qué dice el contrato y en qué coincide o se aparta ' +
  'de la posición del despacho). Escríbelo en el idioma que se te indique.\n' +
  '- "dealBreaker": true SOLO si outcome es "deviation" y el pasaje encaja en las posiciones inaceptables ' +
  'listadas en la regla. En cualquier otro caso, false.\n' +
  '- "confidence": "alta" si el texto es explícito; "media" si requiere interpretación leve; "baja" si es dudoso.';

/**
 * Extrae y normaliza el JSON del veredicto. Tolera texto/vallas alrededor, pero es ESTRICTO con la
 * forma: `outcome` válido obligatorio; "compliant"/"deviation" exigen `quote` y `analysis` no vacíos —
 * cualquier otra cosa devuelve null (hallazgo FAILED, relanzable). "missing" fuerza quote null,
 * dealBreaker false y confianza "baja" (guardrail "ausente": una ausencia no tiene ancla en el texto).
 */
export function parsePlaybookVerdict(text: string): PlaybookVerdict | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.outcome !== 'compliant' && r.outcome !== 'deviation' && r.outcome !== 'missing')
    return null;
  const analysis = typeof r.analysis === 'string' && r.analysis.trim() ? r.analysis.trim() : null;
  if (r.outcome === 'missing') {
    return {
      outcome: 'missing',
      quote: null,
      analysis: analysis ?? '',
      dealBreaker: false,
      confidence: 'baja',
    };
  }
  const quote = typeof r.quote === 'string' && r.quote.trim() ? r.quote.trim() : null;
  if (!quote || !analysis) return null;
  const confidence =
    r.confidence === 'alta' || r.confidence === 'media' || r.confidence === 'baja'
      ? r.confidence
      : 'baja';
  return {
    outcome: r.outcome,
    quote,
    analysis,
    dealBreaker: r.outcome === 'deviation' && r.dealBreaker === true,
    confidence,
  };
}

/** Radio de la ventana de contexto que se guarda alrededor de la cita (para resaltarla en la UI). */
const CONTEXT_RADIUS = 400;
/** Máximo de reglas por playbook (cada regla = 1 llamada al modelo por revisión). */
const MAX_RULES = 25;

type DocText = { text: string } | { errorCode: string };

type PlaybookWithRules = Playbook & { rules: PlaybookRule[] };

/**
 * PLAYBOOKS de revisión de contratos (estilo Spellbook/Ironclad Jurist): las posiciones del despacho
 * por tema + un motor que revisa un contrato ENTRANTE contra ellas y produce un informe citable por
 * regla (cumple / desviación con severidad / ausente) con redacción alternativa sugerida (la posición
 * preferida, snapshoteada — determinista, sin riesgo de invención).
 *
 * Motor HERMANO de la revisión tabular (misma arquitectura): `AiEngine.complete` one-shot por regla,
 * texto del documento extraído UNA vez por pasada, cuota `AiUsage` (`consume` antes / `recordUsage`
 * después), pasada en background con concurrencia acotada y hallazgos FAILED relanzables. La cita se
 * VERIFICA en servidor (`locateQuote`): un veredicto cuya cita no aparece en el texto no se persiste.
 * El análisis se redacta en el idioma del tenant (`Tenant.locale`).
 */
@Injectable()
export class AiPlaybookService {
  private readonly logger = new Logger(AiPlaybookService.name);
  private readonly concurrency: number;
  private readonly maxDocChars: number;
  private readonly modelOverride: string | undefined;
  /** Revisiones con una pasada en curso (evita procesar el mismo hallazgo dos veces en esta instancia). */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: AiQuotaService,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    const rawConc = Number(config.get<string>('AI_PLAYBOOK_CONCURRENCY'));
    this.concurrency = Number.isFinite(rawConc) && rawConc > 0 ? Math.min(rawConc, 8) : 2;
    const rawChars = Number(config.get<string>('AI_PLAYBOOK_MAX_DOC_CHARS'));
    this.maxDocChars = Number.isFinite(rawChars) && rawChars > 1000 ? Math.floor(rawChars) : 48_000;
    this.modelOverride = config.get<string>('AI_PLAYBOOK_MODEL') || undefined;
  }

  // ── CRUD de playbooks ──────────────────────────────────────────────────────

  async list(user: RequestUser) {
    const playbooks = await this.prisma.playbook.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { rules: true } } },
    });
    return playbooks.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      jurisdiction: p.jurisdiction,
      ruleCount: p._count.rules,
      updatedAt: p.updatedAt,
    }));
  }

  async get(user: RequestUser, id: string) {
    const playbook = await this.findPlaybook(user, id);
    return this.toPlaybookDto(playbook);
  }

  async create(user: RequestUser, dto: CreatePlaybookDto) {
    const playbook = await this.prisma.playbook.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        jurisdiction: (dto.jurisdiction as never) ?? null,
        rules: {
          create: dto.rules.map((r, i) => ({
            tenantId: user.tenantId,
            topic: r.topic.trim(),
            preferredText: r.preferredText?.trim() || null,
            clauseId: r.clauseId || null,
            acceptableText: r.acceptableText?.trim() || null,
            dealBreakers: r.dealBreakers?.trim() || null,
            severity: r.severity ?? 'MEDIUM',
            order: i,
          })),
        },
      },
      include: { rules: { orderBy: { order: 'asc' } } },
    });
    return this.toPlaybookDto(playbook);
  }

  /** Actualiza nombre/descr./jurisdicción y, si llegan `rules`, REEMPLAZA el juego completo de reglas. */
  async update(user: RequestUser, id: string, dto: UpdatePlaybookDto) {
    const playbook = await this.findPlaybook(user, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.rules) {
        await tx.playbookRule.deleteMany({
          where: { tenantId: user.tenantId, playbookId: playbook.id },
        });
        await tx.playbookRule.createMany({
          data: dto.rules.map((r, i) => ({
            tenantId: user.tenantId,
            playbookId: playbook.id,
            topic: r.topic.trim(),
            preferredText: r.preferredText?.trim() || null,
            clauseId: r.clauseId || null,
            acceptableText: r.acceptableText?.trim() || null,
            dealBreakers: r.dealBreakers?.trim() || null,
            severity: r.severity ?? 'MEDIUM',
            order: i,
          })),
        });
      }
      return tx.playbook.update({
        where: { id: playbook.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.jurisdiction !== undefined
            ? { jurisdiction: (dto.jurisdiction as never) ?? null }
            : {}),
        },
        include: { rules: { orderBy: { order: 'asc' } } },
      });
    });
    return this.toPlaybookDto(updated);
  }

  async remove(user: RequestUser, id: string) {
    const res = await this.prisma.playbook.deleteMany({ where: { id, tenantId: user.tenantId } });
    if (res.count === 0) throw new NotFoundException(apiError('ai.playbookNotFound'));
    return { success: true };
  }

  /**
   * Instala el playbook SEMILLA de la jurisdicción del despacho (plantilla de onboarding editable).
   * Idempotente por nombre: si ya existe uno con el nombre de la semilla, 400 `ai.playbookSeedExists`.
   */
  async installSeed(user: RequestUser) {
    const seed = playbookSeedFor(user.jurisdiction);
    const existing = await this.prisma.playbook.findFirst({
      where: { tenantId: user.tenantId, name: seed.name },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(apiError('ai.playbookSeedExists'));
    return this.create(user, {
      name: seed.name,
      description: seed.description,
      jurisdiction: seed.jurisdiction,
      rules: seed.rules.map((r) => ({ ...r })),
    } as CreatePlaybookDto);
  }

  // ── Revisiones ─────────────────────────────────────────────────────────────

  /** Lista las revisiones (de un expediente o de todo el despacho) con el progreso por estados. */
  async listReviews(user: RequestUser, matterId?: string) {
    const reviews = await this.prisma.playbookReview.findMany({
      where: { tenantId: user.tenantId, ...(matterId ? { matterId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    if (reviews.length === 0) return [];
    const counts = await this.prisma.playbookReviewFinding.groupBy({
      by: ['reviewId', 'status'],
      where: { tenantId: user.tenantId, reviewId: { in: reviews.map((r) => r.id) } },
      _count: { _all: true },
    });
    const byReview = new Map<string, { pending: number; done: number; failed: number }>();
    for (const c of counts) {
      const agg = byReview.get(c.reviewId) ?? { pending: 0, done: 0, failed: 0 };
      if (c.status === 'PENDING') agg.pending += c._count._all;
      else if (c.status === 'DONE') agg.done += c._count._all;
      else agg.failed += c._count._all;
      byReview.set(c.reviewId, agg);
    }
    return reviews.map((r) => ({
      id: r.id,
      matterId: r.matterId,
      playbookId: r.playbookId,
      playbookName: r.playbookName,
      documentId: r.documentId,
      documentName: r.documentName,
      progress: byReview.get(r.id) ?? { pending: 0, done: 0, failed: 0 },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Detalle: cabecera + todos los hallazgos (la UI sondea mientras haya PENDING). */
  async getReview(user: RequestUser, id: string) {
    const review = await this.findReview(user, id);
    const findings = await this.prisma.playbookReviewFinding.findMany({
      where: { tenantId: user.tenantId, reviewId: id },
      orderBy: { order: 'asc' },
    });
    return { ...this.toReviewDto(review), findings: findings.map((f) => this.toFindingDto(f)) };
  }

  /**
   * Crea una revisión de un documento del expediente contra un playbook: SNAPSHOT de las reglas (con la
   * posición preferida ya resuelta desde la Clause si la regla apunta a una) como hallazgos PENDING y
   * pasada de revisión en background.
   */
  async createReview(user: RequestUser, dto: CreatePlaybookReviewDto) {
    const review = await this.prepareReview(user, dto);
    this.kick(user, review.id);
    return this.toReviewDto(review);
  }

  /**
   * Variante SÍNCRONA para la herramienta del agente (Zora): crea la revisión, ESPERA la pasada completa
   * y devuelve el detalle con los hallazgos ya resueltos (el informe queda igualmente persistido).
   */
  async runReviewAndWait(user: RequestUser, dto: CreatePlaybookReviewDto) {
    const review = await this.prepareReview(user, dto);
    await this.processReview(user, review.id);
    return this.getReview(user, review.id);
  }

  /** Relanza los hallazgos FAILED (p. ej. tras agotarse la cuota o un error transitorio del proveedor). */
  async retryFailed(user: RequestUser, id: string) {
    this.assertEngineEnabled();
    const review = await this.findReview(user, id);
    const { count } = await this.prisma.playbookReviewFinding.updateMany({
      where: { tenantId: user.tenantId, reviewId: review.id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        outcome: null,
        dealBreaker: false,
        analysis: null,
        confidence: null,
        snippet: null,
        charStart: null,
        charEnd: null,
        context: null,
        error: null,
      },
    });
    if (count > 0) this.kick(user, review.id);
    return { retried: count };
  }

  /** Informe PDF de la revisión (membrete del despacho; hallazgos con cita y redacción sugerida). */
  async exportPdf(
    user: RequestUser,
    id: string,
  ): Promise<{ filename: string; mimeType: string; body: Buffer }> {
    const review = await this.findReview(user, id);
    const findings = await this.prisma.playbookReviewFinding.findMany({
      where: { tenantId: user.tenantId, reviewId: id },
      orderBy: { order: 'asc' },
    });
    const [tenant, matter] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true, taxId: true },
      }),
      this.prisma.matter.findFirst({
        where: { id: review.matterId, tenantId: user.tenantId },
        select: { reference: true, title: true },
      }),
    ]);
    const body = await buildPlaybookReviewPdf({
      firmName: tenant?.name ?? '',
      firmTaxId: tenant?.taxId,
      playbookName: review.playbookName,
      documentName: review.documentName,
      matterReference: matter?.reference ?? '',
      matterTitle: matter?.title ?? '',
      generatedAt: new Date(),
      findings: findings.map((f) => this.toFindingDto(f)),
    });
    const safe = review.documentName.replace(/[^\p{L}\p{N} _.-]/gu, '').trim() || 'contrato';
    return {
      filename: `revision-playbook-${safe}.pdf`,
      mimeType: 'application/pdf',
      body,
    };
  }

  /** Valida playbook + documento, snapshota las reglas y crea la revisión con hallazgos PENDING. */
  private async prepareReview(user: RequestUser, dto: CreatePlaybookReviewDto) {
    this.assertEngineEnabled();
    const playbook = await this.findPlaybook(user, dto.playbookId);
    if (playbook.rules.length === 0) {
      throw new BadRequestException(apiError('ai.playbookNoRules'));
    }
    const document = await this.prisma.document.findFirst({
      where: { id: dto.documentId, tenantId: user.tenantId },
      select: { id: true, name: true, matterId: true },
    });
    if (!document) throw new NotFoundException(apiError('ai.playbookDocumentNotFound'));

    // Posición preferida resuelta al SNAPSHOT: si la regla apunta a una Clause, manda el cuerpo de la
    // cláusula (la biblioteca es la fuente de verdad en el momento de lanzar la revisión).
    const clauseIds = playbook.rules.map((r) => r.clauseId).filter((x): x is string => Boolean(x));
    const clauses = clauseIds.length
      ? await this.prisma.clause.findMany({
          where: { tenantId: user.tenantId, id: { in: clauseIds } },
          select: { id: true, body: true },
        })
      : [];
    const clauseBody = new Map(clauses.map((c) => [c.id, c.body]));

    const review = await this.prisma.playbookReview.create({
      data: {
        tenantId: user.tenantId,
        playbookId: playbook.id,
        matterId: document.matterId,
        documentId: document.id,
        createdByUserId: user.userId,
        playbookName: playbook.name,
        documentName: document.name,
      },
    });
    await this.prisma.playbookReviewFinding.createMany({
      data: playbook.rules.map((r, i) => ({
        tenantId: user.tenantId,
        reviewId: review.id,
        ruleId: r.id,
        topic: r.topic,
        severity: r.severity,
        preferredText: (r.clauseId ? clauseBody.get(r.clauseId) : null) ?? r.preferredText,
        acceptableText: r.acceptableText,
        dealBreakers: r.dealBreakers,
        order: i,
      })),
    });
    return review;
  }

  // ── Motor de revisión (background) ─────────────────────────────────────────

  /**
   * Dispara la pasada en background (fire-and-forget). Re-entrante con seguridad: si ya hay una pasada
   * en curso para la revisión, su bucle recogerá los hallazgos nuevos (busca PENDING en cada iteración).
   * El contexto de tenant se fija explícitamente (la promesa sobrevive a la request).
   */
  private kick(user: RequestUser, reviewId: string): void {
    void runWithTenant(user.tenantId, () => this.processReview(user, reviewId)).catch((err) =>
      this.logger.error(`Revisión de playbook ${reviewId}: pasada fallida`, err as Error),
    );
  }

  /** Bucle de la pasada: lotes de hallazgos PENDING → pool de workers acotado hasta vaciar la cola. */
  private async processReview(user: RequestUser, reviewId: string): Promise<void> {
    if (this.running.has(reviewId)) return;
    this.running.add(reviewId);
    try {
      // Texto del documento cacheado para TODA la pasada: N reglas = 1 descarga + 1 extracción.
      let docText: Promise<DocText> | undefined;
      // Idioma del tenant, una vez por pasada (la salida se redacta SIEMPRE en el idioma del despacho).
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { locale: true },
      });
      const language = languageName(tenant?.locale);
      for (;;) {
        const review = await this.prisma.playbookReview.findFirst({
          where: { id: reviewId, tenantId: user.tenantId },
        });
        if (!review) return;
        const findings = await this.prisma.playbookReviewFinding.findMany({
          where: { tenantId: user.tenantId, reviewId, status: 'PENDING' },
          orderBy: { order: 'asc' },
          take: 50,
        });
        if (findings.length === 0) return;
        docText ??= this.loadDocText(user.tenantId, review.documentId);

        const queue = [...findings];
        let quotaExhausted = false;
        const workers = Array.from(
          { length: Math.min(this.concurrency, queue.length) },
          async () => {
            for (;;) {
              if (quotaExhausted) return;
              const finding = queue.shift();
              if (!finding) return;
              const hitQuota = await this.processFinding(user, review, finding, docText!, language);
              if (hitQuota) quotaExhausted = true;
            }
          },
        );
        await Promise.all(workers);

        if (quotaExhausted) {
          // Sin presupuesto de IA hoy: el resto queda FAILED 'quotaExceeded' (relanzable mañana).
          await this.prisma.playbookReviewFinding.updateMany({
            where: { tenantId: user.tenantId, reviewId, status: 'PENDING' },
            data: { status: 'FAILED', error: 'quotaExceeded' },
          });
          return;
        }
      }
    } finally {
      this.running.delete(reviewId);
    }
  }

  /**
   * Procesa UN hallazgo: texto del contrato → revisor → verificación de la cita → persistencia.
   * Devuelve true si la llamada chocó con la cuota diaria (la pasada debe detenerse).
   */
  private async processFinding(
    user: RequestUser,
    review: PlaybookReview,
    finding: PlaybookReviewFinding,
    loaded: Promise<DocText>,
    language: string,
  ): Promise<boolean> {
    const docText = await loaded;
    if ('errorCode' in docText) {
      await this.failFinding(finding.id, docText.errorCode);
      return false;
    }

    try {
      await this.quota.consume(user);
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        await this.failFinding(finding.id, 'quotaExceeded');
        return true;
      }
      throw err;
    }

    try {
      const truncated = docText.text.length > this.maxDocChars;
      const promptText = truncated ? docText.text.slice(0, this.maxDocChars) : docText.text;
      const res = await this.engine.complete({
        system: REVIEWER_SYSTEM,
        messages: [
          {
            role: 'user',
            content:
              `Regla del playbook:\n` +
              `- Tema: ${finding.topic}\n` +
              `- Posición PREFERIDA del despacho:\n"""\n${finding.preferredText ?? '(no especificada)'}\n"""\n` +
              `- Posiciones ACEPTABLES: ${finding.acceptableText ?? '(no especificadas)'}\n` +
              `- Posiciones INACEPTABLES (deal-breakers): ${finding.dealBreakers ?? '(no especificados)'}\n\n` +
              `Redacta "analysis" en ${language}.\n\n` +
              `Documento: ${review.documentName}\n\n` +
              `Texto del contrato${truncated ? ' (TRUNCADO: falta el final)' : ''}:\n` +
              `"""\n${promptText}\n"""`,
          },
        ],
        maxTokens: 1000,
        model: this.modelOverride,
      });
      await this.quota.recordUsage(
        user,
        res.usage?.inputTokens ?? 0,
        res.usage?.outputTokens ?? 0,
        res.model,
      );
      const model = res.model ?? this.engine.model();

      const verdict = parsePlaybookVerdict(res.text);
      if (!verdict) {
        await this.failFinding(finding.id, 'badResponse');
        return false;
      }
      if (verdict.outcome === 'missing') {
        // "Ausente": el contrato no trata el tema. Sin cita y confianza baja por diseño; se REPORTA,
        // nunca se rellena.
        await this.prisma.playbookReviewFinding.update({
          where: { id: finding.id },
          data: {
            status: 'DONE',
            outcome: 'MISSING',
            dealBreaker: false,
            analysis: verdict.analysis || null,
            confidence: 'baja',
            snippet: null,
            charStart: null,
            charEnd: null,
            context: null,
            error: null,
            model,
          },
        });
        return false;
      }

      // Verificación de la cita: se localiza en el texto REAL; si no aparece, el veredicto no vale.
      const span = locateQuote(docText.text, verdict.quote ?? '');
      if (!span) {
        await this.failFinding(finding.id, 'citationNotFound');
        return false;
      }
      const from = Math.max(0, span.start - CONTEXT_RADIUS);
      const to = Math.min(docText.text.length, span.end + CONTEXT_RADIUS);
      await this.prisma.playbookReviewFinding.update({
        where: { id: finding.id },
        data: {
          status: 'DONE',
          outcome: verdict.outcome === 'compliant' ? 'COMPLIANT' : 'DEVIATION',
          dealBreaker: verdict.dealBreaker,
          analysis: verdict.analysis,
          confidence: verdict.confidence,
          snippet: docText.text.slice(span.start, span.end),
          charStart: span.start,
          charEnd: span.end,
          context: docText.text.slice(from, to),
          error: null,
          model,
        },
      });
      return false;
    } catch (err) {
      this.logger.warn(
        `Hallazgo ${finding.id} (revisión ${review.id}): revisión fallida — ${(err as Error).message}`,
      );
      await this.failFinding(finding.id, 'reviewError');
      return false;
    }
  }

  /** Descarga y extrae el texto de la última versión del documento del expediente. */
  private async loadDocText(tenantId: string, documentId: string): Promise<DocText> {
    const v = await this.prisma.documentVersion.findFirst({
      where: { documentId, tenantId },
      orderBy: { version: 'desc' },
      select: { storageKey: true, mimeType: true },
    });
    if (!v?.storageKey || !v.mimeType) return { errorCode: 'documentNotFound' };
    if (!isExtractableMime(v.mimeType)) return { errorCode: 'notExtractable' };
    try {
      const buffer = await this.storage.get(v.storageKey);
      const extracted = await extractText(v.mimeType, buffer);
      if (!extracted.extractable || extracted.text.trim().length === 0) {
        return { errorCode: 'noText' };
      }
      return { text: extracted.text };
    } catch {
      return { errorCode: 'documentNotFound' };
    }
  }

  private async failFinding(findingId: string, errorCode: string): Promise<void> {
    await this.prisma.playbookReviewFinding.update({
      where: { id: findingId },
      data: { status: 'FAILED', error: errorCode },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertEngineEnabled(): void {
    if (!this.engine.isEnabled()) {
      throw new ServiceUnavailableException(apiError('ai.notConfigured'));
    }
  }

  private async findPlaybook(user: RequestUser, id: string): Promise<PlaybookWithRules> {
    const playbook = await this.prisma.playbook.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { rules: { orderBy: { order: 'asc' } } },
    });
    if (!playbook) throw new NotFoundException(apiError('ai.playbookNotFound'));
    return playbook;
  }

  private async findReview(user: RequestUser, id: string): Promise<PlaybookReview> {
    const review = await this.prisma.playbookReview.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!review) throw new NotFoundException(apiError('ai.playbookReviewNotFound'));
    return review;
  }

  private toPlaybookDto(playbook: PlaybookWithRules) {
    return {
      id: playbook.id,
      name: playbook.name,
      description: playbook.description,
      jurisdiction: playbook.jurisdiction,
      rules: playbook.rules.map((r) => ({
        id: r.id,
        topic: r.topic,
        preferredText: r.preferredText,
        clauseId: r.clauseId,
        acceptableText: r.acceptableText,
        dealBreakers: r.dealBreakers,
        severity: r.severity,
        order: r.order,
      })),
      createdAt: playbook.createdAt,
      updatedAt: playbook.updatedAt,
    };
  }

  private toReviewDto(review: PlaybookReview) {
    return {
      id: review.id,
      playbookId: review.playbookId,
      playbookName: review.playbookName,
      matterId: review.matterId,
      documentId: review.documentId,
      documentName: review.documentName,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private toFindingDto(f: PlaybookReviewFinding) {
    return {
      id: f.id,
      topic: f.topic,
      severity: f.severity,
      preferredText: f.preferredText,
      acceptableText: f.acceptableText,
      dealBreakers: f.dealBreakers,
      order: f.order,
      status: f.status,
      outcome: f.outcome,
      dealBreaker: f.dealBreaker,
      analysis: f.analysis,
      confidence: f.confidence,
      snippet: f.snippet,
      charStart: f.charStart,
      charEnd: f.charEnd,
      context: f.context,
      error: f.error,
      model: f.model,
      updatedAt: f.updatedAt,
    };
  }
}

/** Nombre del idioma para la instrucción de salida (los locales soportados hoy son 'es' y 'en'). */
function languageName(locale?: string | null): string {
  if (locale && locale.toLowerCase().startsWith('en')) return 'inglés';
  return 'español';
}

export { MAX_RULES };
