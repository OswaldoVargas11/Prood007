import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import {
  AI_EMBEDDINGS,
  STORAGE_PROVIDER,
  type EmbeddingsProvider,
  type StorageProvider,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AiQuotaService } from './ai-quota.service';
import { apiError } from '../common/api-messages';
import { extractText, isExtractableMime } from '../documents/text-extract';
import type { RequestUser } from '../auth/auth.types';

export interface SemanticHit {
  kind: string;
  refId: string;
  refLabel: string;
  excerpt: string;
  score: number;
}

/** Fila mínima de embedding para el ranking (subconjunto de AiEmbedding). */
export interface EmbeddingRow {
  kind: string;
  refId: string;
  refLabel: string;
  content: string;
  embedding: number[];
}

/**
 * Búsqueda semántica (RAG). Indexa fragmentos de expedientes (cabecera, tareas, documentos) como vectores
 * y resuelve la consulta por SIMILITUD COSENO calculada en la app sobre los vectores del tenant. Sin
 * `VOYAGE_API_KEY` el proveedor de embeddings está deshabilitado y estas operaciones devuelven 503
 * `ai.searchDisabled` (la UI cae a la búsqueda por texto existente). Tenant-scoped por RLS + filtro.
 */
@Injectable()
export class AiSearchService {
  /** Tope de vectores a comparar por consulta (a escala de despacho sobra; evita cargas patológicas). */
  private static readonly MAX_VECTORS = 5000;

  /** Tope de documentos a (re)indexar por tenant en una pasada del cron (acota descargas del almacén). */
  static readonly MAX_DOC_REINDEX_PER_RUN = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: AiQuotaService,
    @Inject(AI_EMBEDDINGS) private readonly embeddings: EmbeddingsProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** (Re)indexa un expediente desde una ruta con sesión. */
  async indexMatter(user: RequestUser, matterId: string): Promise<{ chunks: number }> {
    await this.quota.consume(user);
    return this.indexMatterForTenant(user.tenantId, matterId);
  }

  /** ¿Está disponible el indexado/búsqueda semántica? (hay clave de embeddings). */
  isEnabled(): boolean {
    return this.embeddings.isEnabled();
  }

  /**
   * IDs de expedientes ACTIVOS que necesitan (re)indexarse: sin vectores o modificados después del último
   * indexado. Lo usa el cron nocturno para mantener el corpus de búsqueda del despacho al día.
   */
  async staleMatterIds(tenantId: string): Promise<string[]> {
    const matters = await this.prisma.matter.findMany({
      where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] } },
      select: { id: true, updatedAt: true },
    });
    if (matters.length === 0) return [];
    const indexed = await this.prisma.aiEmbedding.groupBy({
      by: ['refId'],
      where: { tenantId, kind: 'matter', refId: { in: matters.map((m) => m.id) } },
      _max: { createdAt: true },
    });
    const lastIndexed = new Map(indexed.map((r) => [r.refId, r._max.createdAt]));
    return matters
      .filter((m) => {
        const at = lastIndexed.get(m.id);
        return !at || at < m.updatedAt;
      })
      .map((m) => m.id);
  }

  /** (Re)indexa un expediente por tenantId (usable sin sesión, p. ej. desde el cron). */
  async indexMatterForTenant(tenantId: string, matterId: string): Promise<{ chunks: number }> {
    this.assertEnabled();
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId },
      include: {
        client: { select: { name: true } },
        documents: { select: { name: true }, take: 50 },
        tasks: { select: { title: true, status: true }, take: 50 },
      },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));

    const label = `${matter.reference} — ${matter.title}`;
    const chunks: string[] = [
      `Expediente ${matter.reference}: ${matter.title}. Tipo ${matter.type}. Estado ${matter.status}. Cliente ${matter.client.name}.`,
      ...(matter.opposingParty ? [`Parte contraria: ${matter.opposingParty}.`] : []),
      ...matter.tasks.map((t) => `Tarea: ${t.title} (${t.status}).`),
      ...matter.documents.map((d) => `Documento: ${d.name}.`),
    ].filter((c) => c.trim().length > 0);

    const vectors = await this.embeddings.embed(chunks);
    const model = this.modelTag();

    await this.prisma.aiEmbedding.deleteMany({
      where: { tenantId, kind: 'matter', refId: matterId },
    });
    await this.prisma.$transaction(
      chunks.map((content, i) =>
        this.prisma.aiEmbedding.create({
          data: {
            tenantId,
            kind: 'matter',
            refId: matterId,
            refLabel: label,
            chunkIndex: i,
            content,
            embedding: vectors[i] ?? [],
            model,
          },
        }),
      ),
    );
    return { chunks: chunks.length };
  }

  /**
   * Indexa el CONTENIDO de una versión de documento (texto extraído) para la búsqueda semántica, con
   * kind='document' y refId=documentId. Best-effort: no-op sin clave de embeddings o si el formato no
   * es extraíble (PDF/imágenes). Reindexar reemplaza los fragmentos previos del documento. Pensado para
   * llamarse fire-and-forget al subir/añadir versión (no debe bloquear ni romper la subida).
   */
  async indexDocumentVersionContent(
    tenantId: string,
    documentId: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<{ chunks: number }> {
    if (!this.embeddings.isEnabled()) return { chunks: 0 };
    const extracted = await extractText(mimeType, buffer);
    if (!extracted.extractable || extracted.text.trim().length === 0) return { chunks: 0 };

    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
      select: { name: true, matter: { select: { reference: true } } },
    });
    if (!doc) return { chunks: 0 };
    const label = doc.matter ? `${doc.name} · ${doc.matter.reference}` : doc.name;
    const chunks = chunkText(extracted.text, 800, 30);
    if (chunks.length === 0) return { chunks: 0 };

    const vectors = await this.embeddings.embed(chunks);
    const model = this.modelTag();
    await this.prisma.aiEmbedding.deleteMany({
      where: { tenantId, kind: 'document', refId: documentId },
    });
    await this.prisma.$transaction(
      chunks.map((content, i) =>
        this.prisma.aiEmbedding.create({
          data: {
            tenantId,
            kind: 'document',
            refId: documentId,
            refLabel: label,
            chunkIndex: i,
            content,
            embedding: vectors[i] ?? [],
            model,
          },
        }),
      ),
    );
    return { chunks: chunks.length };
  }

  /**
   * IDs de documentos cuyo CONTENIDO necesita (re)indexarse: última versión de un formato extraíble
   * (docx/texto) que aún no tiene embeddings de tipo 'document' o cuya versión es posterior al último
   * indexado. Es el equivalente a `staleMatterIds` pero para el contenido de documentos: sin esto, el
   * corpus de documentos SUBIDOS ANTES de activar `VOYAGE_API_KEY` nunca entraría en la búsqueda por
   * contenido (solo se indexa al subir). Filtra por MIME extraíble para no reintentar PDFs/imágenes cada
   * noche, y acota a `MAX_DOC_REINDEX_PER_RUN` para no descargar el almacén sin límite en una pasada.
   */
  async staleDocumentIds(tenantId: string): Promise<string[]> {
    const docs = await this.prisma.document.findMany({
      where: { tenantId },
      select: {
        id: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { mimeType: true, createdAt: true },
        },
      },
    });
    const extractable = docs
      .map((d) => ({ id: d.id, latest: d.versions[0] }))
      .filter((d) => d.latest && isExtractableMime(d.latest.mimeType));
    if (extractable.length === 0) return [];

    const indexed = await this.prisma.aiEmbedding.groupBy({
      by: ['refId'],
      where: {
        tenantId,
        kind: 'document',
        refId: { in: extractable.map((d) => d.id) },
      },
      _max: { createdAt: true },
    });
    const lastIndexed = new Map(indexed.map((r) => [r.refId, r._max.createdAt]));
    return extractable
      .filter((d) => {
        const at = lastIndexed.get(d.id);
        return !at || (d.latest && at < d.latest.createdAt);
      })
      .map((d) => d.id)
      .slice(0, AiSearchService.MAX_DOC_REINDEX_PER_RUN);
  }

  /**
   * (Re)indexa el contenido de un documento leyendo su última versión del almacenamiento (usable desde el
   * cron, sin sesión). No-op sin clave de embeddings o si no hay versión / no es extraíble.
   */
  async reindexDocumentContentForTenant(
    tenantId: string,
    documentId: string,
  ): Promise<{ chunks: number }> {
    if (!this.embeddings.isEnabled()) return { chunks: 0 };
    const version = await this.prisma.documentVersion.findFirst({
      where: { tenantId, documentId },
      orderBy: { version: 'desc' },
      select: { mimeType: true, storageKey: true },
    });
    if (!version) return { chunks: 0 };
    const buffer = await this.storage.get(version.storageKey);
    return this.indexDocumentVersionContent(tenantId, documentId, version.mimeType, buffer);
  }

  /** Busca por significado en lo indexado del despacho. */
  async search(user: RequestUser, query: string, limit = 8): Promise<SemanticHit[]> {
    this.assertEnabled();
    await this.quota.consume(user);
    const [qvec] = await this.embeddings.embed([query]);
    if (!qvec) return [];

    const rows = await this.prisma.aiEmbedding.findMany({
      where: { tenantId: user.tenantId },
      select: { kind: true, refId: true, refLabel: true, content: true, embedding: true },
      take: AiSearchService.MAX_VECTORS,
    });

    return rankHits(qvec, rows, limit);
  }

  private assertEnabled(): void {
    if (!this.embeddings.isEnabled()) {
      throw new ServiceUnavailableException(apiError('ai.searchDisabled'));
    }
  }

  private modelTag(): string {
    return `voyage:${this.embeddings.dimensions()}`;
  }
}

/**
 * Ordena fragmentos indexados por similitud coseno con el vector de consulta y devuelve, como máximo,
 * `limit` resultados quedándose con el MEJOR fragmento por referencia (kind:refId) para no repetir el
 * mismo expediente/documento. Puro y determinista: es la lógica de ranking testeable sin BD ni proveedor.
 */
export function rankHits(qvec: number[], rows: EmbeddingRow[], limit: number): SemanticHit[] {
  const scored = rows
    .map((r) => ({
      kind: r.kind,
      refId: r.refId,
      refLabel: r.refLabel,
      excerpt: r.content,
      score: cosine(qvec, r.embedding),
    }))
    .filter((h) => Number.isFinite(h.score))
    .sort((a, b) => b.score - a.score);

  // Quédate con el mejor fragmento por referencia (no repetir el mismo expediente).
  const seen = new Set<string>();
  const out: SemanticHit[] = [];
  for (const h of scored) {
    const key = `${h.kind}:${h.refId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Trocea un texto largo en fragmentos de ~`maxLen` caracteres respetando límites de párrafo/frase
 * cuando es posible. Limita a `maxChunks` para acotar el coste de embeddings de documentos enormes.
 */
export function chunkText(text: string, maxLen: number, maxChunks: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < normalized.length && chunks.length < maxChunks) {
    let end = Math.min(i + maxLen, normalized.length);
    if (end < normalized.length) {
      // Corta en el último espacio para no partir palabras.
      const lastSpace = normalized.lastIndexOf(' ', end);
      if (lastSpace > i + maxLen * 0.6) end = lastSpace;
    }
    chunks.push(normalized.slice(i, end).trim());
    i = end;
  }
  return chunks.filter((c) => c.length > 0);
}

/** Similitud coseno entre dos vectores. Devuelve 0 si alguno es nulo o de longitud distinta. */
export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
