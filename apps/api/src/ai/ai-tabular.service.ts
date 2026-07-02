import { randomUUID } from 'node:crypto';
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
import type { TabularReview, TabularReviewCell } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AiQuotaService } from './ai-quota.service';
import { apiError } from '../common/api-messages';
import { extractText, isExtractableMime } from '../documents/text-extract';
import { buildXlsx, toCsv, type TabularExportTable } from './ai-tabular.export';
import type { CreateTabularReviewDto, TabularColumnDto } from './dto/ai.dto';
import type { RequestUser } from '../auth/auth.types';

/** Columna de una revisión (persistida como JSON ordenado en `TabularReview.columns`). */
export interface TabularColumn {
  id: string;
  label: string;
}

/** Fila (documento) de una revisión (persistida como JSON ordenado en `TabularReview.documents`). */
export interface TabularRowDoc {
  id: string;
  source: 'document' | 'dataroom';
  name: string;
}

/** Respuesta del extractor, ya normalizada (forma validada; la CITA aún sin verificar contra el texto). */
export interface ExtractionResponse {
  found: boolean;
  value: string | null;
  quote: string | null;
  confidence: 'alta' | 'media' | 'baja';
}

/**
 * Prompt del EXTRACTOR. El guardrail anti-invención es doble: (1) se exige una cita LITERAL del texto y
 * (2) si el documento no contiene la respuesta debe decir found=false ("no consta") con confianza baja.
 * La cita se VERIFICA después en servidor (`locateQuote`): una respuesta cuya cita no aparece en el texto
 * no se persiste como dato — nunca se muestra al letrado un valor sin ancla comprobada.
 */
const EXTRACTOR_SYSTEM =
  'Eres un extractor de datos de documentos para un despacho de abogados. Recibirás el TEXTO de un ' +
  'documento y UNA columna a extraer (una pregunta o atributo en lenguaje natural).\n\n' +
  'Responde SOLO con un objeto JSON válido, sin markdown ni texto adicional, con esta forma exacta:\n' +
  '{"found": true|false, "value": string|null, "quote": string|null, "confidence": "alta"|"media"|"baja"}\n\n' +
  'Reglas ESTRICTAS:\n' +
  '- "value": la respuesta, concisa y en español (p. ej. una fecha, la esencia de una cláusula, una ley aplicable).\n' +
  '- "quote": una cita LITERAL copiada carácter a carácter del texto del documento (máximo 300 caracteres) ' +
  'de la que se deduce "value". Sin cita literal no hay respuesta válida.\n' +
  '- Si el documento NO contiene la respuesta, devuelve exactamente ' +
  '{"found": false, "value": null, "quote": null, "confidence": "baja"}. NUNCA respondas con conocimiento ' +
  'externo, suposiciones ni deducciones que no estén escritas en el texto.\n' +
  '- "confidence": "alta" si el texto lo dice de forma explícita; "media" si requiere interpretación leve; ' +
  '"baja" si es dudoso.';

/**
 * Extrae y normaliza el JSON de la respuesta del modelo. Tolera texto/vallas alrededor (se queda con el
 * primer `{` y el último `}`), pero es ESTRICTO con la forma: `found` boolean obligatorio y, si
 * `found=true`, `value` y `quote` no vacíos — cualquier otra cosa devuelve null (celda FAILED,
 * relanzable). Si `found=false` se fuerza confianza "baja" (guardrail "no consta").
 */
export function parseExtractionResponse(text: string): ExtractionResponse | null {
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
  if (typeof r.found !== 'boolean') return null;
  if (!r.found) return { found: false, value: null, quote: null, confidence: 'baja' };
  const value = typeof r.value === 'string' && r.value.trim() ? r.value.trim() : null;
  const quote = typeof r.quote === 'string' && r.quote.trim() ? r.quote.trim() : null;
  if (!value || !quote) return null;
  const confidence =
    r.confidence === 'alta' || r.confidence === 'media' || r.confidence === 'baja'
      ? r.confidence
      : 'baja';
  return { found: true, value, quote, confidence };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Localiza la cita del modelo dentro del texto extraído y devuelve sus offsets REALES. Primero búsqueda
 * exacta; si falla, tolerante a espacios (el modelo puede colapsar saltos de línea del original). Si no
 * aparece, devuelve null: la cita NO se verifica y la celda no se da por buena (anti-alucinación).
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  const exact = text.indexOf(trimmed);
  if (exact >= 0) return { start: exact, end: exact + trimmed.length };
  const pattern = trimmed.split(/\s+/).map(escapeRegExp).join('\\s+');
  try {
    const m = new RegExp(pattern).exec(text);
    if (m) return { start: m.index, end: m.index + m[0].length };
  } catch {
    // Patrón inválido/demasiado grande: se trata como no localizada.
  }
  return null;
}

/** Radio de la ventana de contexto que se guarda alrededor de la cita (para resaltarla en la UI). */
const CONTEXT_RADIUS = 400;

type DocText = { text: string } | { errorCode: string };

/**
 * Motor de REVISIÓN TABULAR (estilo Legora): documentos × columnas en lenguaje natural → tabla de
 * extracciones citables. Servicio HERMANO del agente conversacional (no toca su motor): usa el
 * `AiEngine.complete` one-shot por celda, reutilizando la extracción de texto existente
 * (`extractText`, la misma del indexado RAG — no reprocesa formatos nuevos) y respetando la cuota
 * `AiUsage` por tenant (`consume` antes de cada llamada, `recordUsage` después).
 *
 * Procesamiento: al crear la revisión (o añadir columna / relanzar) se dispara en background un bucle
 * por celdas PENDING con CONCURRENCIA ACOTADA (`AI_TABULAR_CONCURRENCY`, default 2) y el texto de cada
 * documento cacheado por pasada (se descarga/extrae UNA vez aunque haya N columnas). La UI sondea el
 * estado por celda. Si se agota la cuota diaria, las celdas restantes quedan FAILED 'quotaExceeded'
 * (relanzables al día siguiente). Modelo por celda: `AI_TABULAR_MODEL` si se define; si no, el modelo
 * del despacho (`AI_MODEL` del motor).
 */
@Injectable()
export class AiTabularService {
  private readonly logger = new Logger(AiTabularService.name);
  private readonly concurrency: number;
  private readonly maxDocChars: number;
  private readonly modelOverride: string | undefined;
  /** Revisiones con una pasada en curso (evita procesar la misma celda dos veces en esta instancia). */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: AiQuotaService,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    const rawConc = Number(config.get<string>('AI_TABULAR_CONCURRENCY'));
    this.concurrency = Number.isFinite(rawConc) && rawConc > 0 ? Math.min(rawConc, 8) : 2;
    const rawChars = Number(config.get<string>('AI_TABULAR_MAX_DOC_CHARS'));
    this.maxDocChars = Number.isFinite(rawChars) && rawChars > 1000 ? Math.floor(rawChars) : 48_000;
    this.modelOverride = config.get<string>('AI_TABULAR_MODEL') || undefined;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /** Lista las revisiones (de un expediente o de todo el despacho) con el progreso por estados. */
  async list(user: RequestUser, matterId?: string) {
    const reviews = await this.prisma.tabularReview.findMany({
      where: { tenantId: user.tenantId, ...(matterId ? { matterId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    if (reviews.length === 0) return [];
    const counts = await this.prisma.tabularReviewCell.groupBy({
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
      title: r.title,
      columns: r.columns as unknown as TabularColumn[],
      documentCount: (r.documents as unknown as TabularRowDoc[]).length,
      progress: byReview.get(r.id) ?? { pending: 0, done: 0, failed: 0 },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Detalle: definición (columnas + documentos fila) y todas las celdas con su estado y cita. */
  async get(user: RequestUser, id: string) {
    const review = await this.findReview(user, id);
    const cells = await this.prisma.tabularReviewCell.findMany({
      where: { tenantId: user.tenantId, reviewId: id },
    });
    return { ...this.toReviewDto(review), cells: cells.map((c) => this.toCellDto(c)) };
  }

  /**
   * Crea una revisión: resuelve el conjunto de documentos (selección del expediente, carpeta de data
   * room o data room completo), crea las celdas PENDING (documentos × columnas) y dispara la extracción
   * en background.
   */
  async create(user: RequestUser, dto: CreateTabularReviewDto) {
    this.assertEngineEnabled();
    const { matterId, docs } = await this.resolveDocuments(user, dto);
    const columns: TabularColumn[] = dto.columns.map((c: TabularColumnDto) => ({
      id: `col_${randomUUID().slice(0, 8)}`,
      label: c.label.trim(),
    }));

    const review = await this.prisma.tabularReview.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        createdByUserId: user.userId,
        title: dto.title.trim(),
        columns: columns as unknown as object[],
        documents: docs as unknown as object[],
      },
    });
    await this.prisma.tabularReviewCell.createMany({
      data: docs.flatMap((d) =>
        columns.map((col) => ({
          tenantId: user.tenantId,
          reviewId: review.id,
          documentId: d.id,
          columnId: col.id,
        })),
      ),
    });
    this.kick(user, review.id);
    return this.toReviewDto(review);
  }

  /** Añade una columna: se crean sus celdas PENDING para cada documento y se procesa en background. */
  async addColumn(user: RequestUser, id: string, label: string) {
    this.assertEngineEnabled();
    const review = await this.findReview(user, id);
    const columns = review.columns as unknown as TabularColumn[];
    if (columns.length >= 12) {
      throw new BadRequestException(apiError('ai.tabularColumnLimit'));
    }
    const column: TabularColumn = { id: `col_${randomUUID().slice(0, 8)}`, label: label.trim() };
    const docs = review.documents as unknown as TabularRowDoc[];
    const updated = await this.prisma.tabularReview.update({
      where: { id: review.id },
      data: { columns: [...columns, column] as unknown as object[] },
    });
    await this.prisma.tabularReviewCell.createMany({
      data: docs.map((d) => ({
        tenantId: user.tenantId,
        reviewId: review.id,
        documentId: d.id,
        columnId: column.id,
      })),
    });
    this.kick(user, review.id);
    return this.toReviewDto(updated);
  }

  /** Quita una columna y borra sus celdas. */
  async removeColumn(user: RequestUser, id: string, columnId: string) {
    const review = await this.findReview(user, id);
    const columns = review.columns as unknown as TabularColumn[];
    if (!columns.some((c) => c.id === columnId)) {
      throw new NotFoundException(apiError('ai.tabularReviewNotFound'));
    }
    const updated = await this.prisma.tabularReview.update({
      where: { id: review.id },
      data: { columns: columns.filter((c) => c.id !== columnId) as unknown as object[] },
    });
    await this.prisma.tabularReviewCell.deleteMany({
      where: { tenantId: user.tenantId, reviewId: review.id, columnId },
    });
    return this.toReviewDto(updated);
  }

  /** Relanza las celdas FAILED (p. ej. tras agotarse la cuota o un error transitorio del proveedor). */
  async retryFailed(user: RequestUser, id: string) {
    this.assertEngineEnabled();
    const review = await this.findReview(user, id);
    const { count } = await this.prisma.tabularReviewCell.updateMany({
      where: { tenantId: user.tenantId, reviewId: review.id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        error: null,
        value: null,
        notFound: false,
        confidence: null,
        snippet: null,
        charStart: null,
        charEnd: null,
        context: null,
      },
    });
    if (count > 0) this.kick(user, review.id);
    return { retried: count };
  }

  /** Export CSV o XLSX de la tabla (celdas resueltas a texto plano). */
  async export(
    user: RequestUser,
    id: string,
    format: 'csv' | 'xlsx',
  ): Promise<{ filename: string; mimeType: string; body: Buffer }> {
    const review = await this.findReview(user, id);
    const columns = review.columns as unknown as TabularColumn[];
    const docs = review.documents as unknown as TabularRowDoc[];
    const cells = await this.prisma.tabularReviewCell.findMany({
      where: { tenantId: user.tenantId, reviewId: id },
    });
    const byKey = new Map(cells.map((c) => [`${c.documentId}:${c.columnId}`, c]));
    const table: TabularExportTable = {
      title: review.title,
      headers: ['Documento', ...columns.map((c) => c.label)],
      rows: docs.map((d) => [
        d.name,
        ...columns.map((col) => {
          const cell = byKey.get(`${d.id}:${col.id}`);
          if (!cell || cell.status === 'PENDING') return '';
          if (cell.status === 'FAILED') return '(error)';
          return cell.notFound ? 'no consta' : (cell.value ?? '');
        }),
      ]),
    };
    const safeTitle = review.title.replace(/[^\p{L}\p{N} _.-]/gu, '').trim() || 'revision';
    if (format === 'xlsx') {
      return {
        filename: `${safeTitle}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: await buildXlsx(table),
      };
    }
    return {
      filename: `${safeTitle}.csv`,
      mimeType: 'text/csv; charset=utf-8',
      body: Buffer.from(toCsv(table), 'utf8'),
    };
  }

  // ── Motor de extracción (background) ──────────────────────────────────────

  /**
   * Dispara la pasada de extracción en background (fire-and-forget). Se re-entra con seguridad: si ya
   * hay una pasada en curso para la revisión, las celdas nuevas las recogerá su bucle (busca PENDING en
   * cada iteración). El contexto de tenant se fija explícitamente (la promesa sobrevive a la request).
   */
  private kick(user: RequestUser, reviewId: string): void {
    void runWithTenant(user.tenantId, () => this.processReview(user, reviewId)).catch((err) =>
      this.logger.error(`Revisión tabular ${reviewId}: pasada fallida`, err as Error),
    );
  }

  /** Bucle de la pasada: lotes de celdas PENDING → pool de workers acotado hasta vaciar la cola. */
  private async processReview(user: RequestUser, reviewId: string): Promise<void> {
    if (this.running.has(reviewId)) return;
    this.running.add(reviewId);
    try {
      // Texto por documento cacheado para TODA la pasada: N columnas = 1 descarga + 1 extracción.
      const texts = new Map<string, Promise<DocText>>();
      for (;;) {
        const review = await this.prisma.tabularReview.findFirst({
          where: { id: reviewId, tenantId: user.tenantId },
        });
        if (!review) return;
        const cells = await this.prisma.tabularReviewCell.findMany({
          where: { tenantId: user.tenantId, reviewId, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        if (cells.length === 0) return;

        const queue = [...cells];
        let quotaExhausted = false;
        const workers = Array.from(
          { length: Math.min(this.concurrency, queue.length) },
          async () => {
            for (;;) {
              if (quotaExhausted) return;
              const cell = queue.shift();
              if (!cell) return;
              const hitQuota = await this.processCell(user, review, cell, texts);
              if (hitQuota) quotaExhausted = true;
            }
          },
        );
        await Promise.all(workers);

        if (quotaExhausted) {
          // Sin presupuesto de IA hoy: el resto queda FAILED 'quotaExceeded' (relanzable mañana).
          await this.prisma.tabularReviewCell.updateMany({
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
   * Procesa UNA celda: texto del documento → extractor → verificación de la cita → persistencia.
   * Devuelve true si la llamada chocó con la cuota diaria (la pasada debe detenerse).
   */
  private async processCell(
    user: RequestUser,
    review: TabularReview,
    cell: TabularReviewCell,
    texts: Map<string, Promise<DocText>>,
  ): Promise<boolean> {
    const columns = review.columns as unknown as TabularColumn[];
    const docs = review.documents as unknown as TabularRowDoc[];
    const column = columns.find((c) => c.id === cell.columnId);
    const doc = docs.find((d) => d.id === cell.documentId);
    if (!column || !doc) {
      await this.failCell(cell.id, 'definitionMissing');
      return false;
    }

    let loaded = texts.get(doc.id);
    if (!loaded) {
      loaded = this.loadDocText(user.tenantId, doc);
      texts.set(doc.id, loaded);
    }
    const docText = await loaded;
    if ('errorCode' in docText) {
      await this.failCell(cell.id, docText.errorCode);
      return false;
    }

    try {
      await this.quota.consume(user);
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        await this.failCell(cell.id, 'quotaExceeded');
        return true;
      }
      throw err;
    }

    try {
      const truncated = docText.text.length > this.maxDocChars;
      const promptText = truncated ? docText.text.slice(0, this.maxDocChars) : docText.text;
      const res = await this.engine.complete({
        system: EXTRACTOR_SYSTEM,
        messages: [
          {
            role: 'user',
            content:
              `Columna a extraer: ${column.label}\n\n` +
              `Documento: ${doc.name}\n\n` +
              `Texto del documento${truncated ? ' (TRUNCADO: falta el final)' : ''}:\n` +
              `"""\n${promptText}\n"""`,
          },
        ],
        maxTokens: 600,
        model: this.modelOverride,
      });
      await this.quota.recordUsage(
        user,
        res.usage?.inputTokens ?? 0,
        res.usage?.outputTokens ?? 0,
        res.model,
      );
      const model = res.model ?? this.engine.model();

      const parsed = parseExtractionResponse(res.text);
      if (!parsed) {
        await this.failCell(cell.id, 'badResponse');
        return false;
      }
      if (!parsed.found) {
        // "No consta": el documento no contiene la respuesta. Sin cita y confianza baja por diseño.
        await this.prisma.tabularReviewCell.update({
          where: { id: cell.id },
          data: {
            status: 'DONE',
            value: null,
            notFound: true,
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

      // Verificación de la cita: se localiza en el texto REAL; si no aparece, la respuesta no vale.
      const span = locateQuote(docText.text, parsed.quote ?? '');
      if (!span) {
        await this.failCell(cell.id, 'citationNotFound');
        return false;
      }
      const from = Math.max(0, span.start - CONTEXT_RADIUS);
      const to = Math.min(docText.text.length, span.end + CONTEXT_RADIUS);
      await this.prisma.tabularReviewCell.update({
        where: { id: cell.id },
        data: {
          status: 'DONE',
          value: parsed.value,
          notFound: false,
          confidence: parsed.confidence,
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
        `Celda ${cell.id} (revisión ${review.id}): extracción fallida — ${(err as Error).message}`,
      );
      await this.failCell(cell.id, 'extractionError');
      return false;
    }
  }

  /** Descarga y extrae el texto de un documento fila (Document del expediente o DataRoomDocument). */
  private async loadDocText(tenantId: string, doc: TabularRowDoc): Promise<DocText> {
    let storageKey: string | undefined;
    let mimeType: string | undefined;
    if (doc.source === 'dataroom') {
      const d = await this.prisma.dataRoomDocument.findFirst({
        where: { id: doc.id, tenantId },
        select: { storageKey: true, mimeType: true },
      });
      storageKey = d?.storageKey;
      mimeType = d?.mimeType;
    } else {
      const v = await this.prisma.documentVersion.findFirst({
        where: { documentId: doc.id, tenantId },
        orderBy: { version: 'desc' },
        select: { storageKey: true, mimeType: true },
      });
      storageKey = v?.storageKey;
      mimeType = v?.mimeType;
    }
    if (!storageKey || !mimeType) return { errorCode: 'documentNotFound' };
    if (!isExtractableMime(mimeType)) return { errorCode: 'notExtractable' };
    try {
      const buffer = await this.storage.get(storageKey);
      const extracted = await extractText(mimeType, buffer);
      if (!extracted.extractable || extracted.text.trim().length === 0) {
        return { errorCode: 'noText' };
      }
      return { text: extracted.text };
    } catch {
      return { errorCode: 'documentNotFound' };
    }
  }

  private async failCell(cellId: string, errorCode: string): Promise<void> {
    await this.prisma.tabularReviewCell.update({
      where: { id: cellId },
      data: { status: 'FAILED', error: errorCode },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertEngineEnabled(): void {
    if (!this.engine.isEnabled()) {
      throw new ServiceUnavailableException(apiError('ai.notConfigured'));
    }
  }

  private async findReview(user: RequestUser, id: string): Promise<TabularReview> {
    const review = await this.prisma.tabularReview.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!review) throw new NotFoundException(apiError('ai.tabularReviewNotFound'));
    return review;
  }

  /** Resuelve el conjunto de documentos fila según la vía elegida en el DTO (una sola). */
  private async resolveDocuments(
    user: RequestUser,
    dto: CreateTabularReviewDto,
  ): Promise<{ matterId: string; docs: TabularRowDoc[] }> {
    if (dto.dataRoomFolderId || dto.dataRoomId) {
      let dataRoomId = dto.dataRoomId;
      let folderId: string | undefined;
      if (dto.dataRoomFolderId) {
        const folder = await this.prisma.dataRoomFolder.findFirst({
          where: { id: dto.dataRoomFolderId, tenantId: user.tenantId },
          select: { id: true, dataRoomId: true },
        });
        if (!folder) throw new BadRequestException(apiError('ai.tabularNoDocuments'));
        dataRoomId = folder.dataRoomId;
        folderId = folder.id;
      }
      const room = await this.prisma.dataRoom.findFirst({
        where: { id: dataRoomId, tenantId: user.tenantId },
        select: { id: true, matterId: true },
      });
      if (!room) throw new BadRequestException(apiError('ai.tabularNoDocuments'));
      const docs = await this.prisma.dataRoomDocument.findMany({
        where: {
          tenantId: user.tenantId,
          dataRoomId: room.id,
          ...(folderId ? { folderId } : {}),
        },
        orderBy: { name: 'asc' },
        take: 50,
        select: { id: true, name: true },
      });
      if (docs.length === 0) throw new BadRequestException(apiError('ai.tabularNoDocuments'));
      return {
        matterId: room.matterId,
        docs: docs.map((d) => ({ id: d.id, source: 'dataroom' as const, name: d.name })),
      };
    }

    if (dto.documentIds?.length && dto.matterId) {
      const docs = await this.prisma.document.findMany({
        where: { tenantId: user.tenantId, matterId: dto.matterId, id: { in: dto.documentIds } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      if (docs.length === 0) throw new BadRequestException(apiError('ai.tabularNoDocuments'));
      return {
        matterId: dto.matterId,
        docs: docs.map((d) => ({ id: d.id, source: 'document' as const, name: d.name })),
      };
    }

    throw new BadRequestException(apiError('ai.tabularNoDocuments'));
  }

  private toReviewDto(review: TabularReview) {
    return {
      id: review.id,
      matterId: review.matterId,
      title: review.title,
      columns: review.columns as unknown as TabularColumn[],
      documents: review.documents as unknown as TabularRowDoc[],
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private toCellDto(cell: TabularReviewCell) {
    return {
      id: cell.id,
      documentId: cell.documentId,
      columnId: cell.columnId,
      status: cell.status,
      value: cell.value,
      notFound: cell.notFound,
      confidence: cell.confidence,
      snippet: cell.snippet,
      charStart: cell.charStart,
      charEnd: cell.charEnd,
      page: cell.page,
      context: cell.context,
      error: cell.error,
      model: cell.model,
      updatedAt: cell.updatedAt,
    };
  }
}
