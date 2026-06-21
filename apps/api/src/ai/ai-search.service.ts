import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AI_EMBEDDINGS, type EmbeddingsProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

export interface SemanticHit {
  kind: string;
  refId: string;
  refLabel: string;
  excerpt: string;
  score: number;
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

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_EMBEDDINGS) private readonly embeddings: EmbeddingsProvider,
  ) {}

  /** (Re)indexa un expediente: borra sus vectores previos e inserta los nuevos. */
  async indexMatter(user: RequestUser, matterId: string): Promise<{ chunks: number }> {
    this.assertEnabled();
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
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
      where: { tenantId: user.tenantId, kind: 'matter', refId: matterId },
    });
    await this.prisma.$transaction(
      chunks.map((content, i) =>
        this.prisma.aiEmbedding.create({
          data: {
            tenantId: user.tenantId,
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

  /** Busca por significado en lo indexado del despacho. */
  async search(user: RequestUser, query: string, limit = 8): Promise<SemanticHit[]> {
    this.assertEnabled();
    const [qvec] = await this.embeddings.embed([query]);
    if (!qvec) return [];

    const rows = await this.prisma.aiEmbedding.findMany({
      where: { tenantId: user.tenantId },
      select: { kind: true, refId: true, refLabel: true, content: true, embedding: true },
      take: AiSearchService.MAX_VECTORS,
    });

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

  private assertEnabled(): void {
    if (!this.embeddings.isEnabled()) {
      throw new ServiceUnavailableException(apiError('ai.searchDisabled'));
    }
  }

  private modelTag(): string {
    return `voyage:${this.embeddings.dimensions()}`;
  }
}

/** Similitud coseno entre dos vectores. Devuelve 0 si alguno es nulo o de longitud distinta. */
function cosine(a: number[], b: number[]): number {
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
