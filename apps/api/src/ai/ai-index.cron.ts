import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AiSearchService } from './ai-search.service';

/**
 * Reindexado nocturno del corpus de búsqueda semántica del despacho: (re)indexa los expedientes activos
 * y el CONTENIDO de los documentos (texto extraído) sin vectores o modificados desde el último indexado,
 * para que "¿hemos llevado un caso así antes?" y "¿dónde dice X?" busquen sobre datos al día sin reindexar
 * a mano. El backfill de documentos es lo que hace que el corpus SUBIDO ANTES de tener embeddings entre en
 * la búsqueda por contenido (al subir solo se indexa lo nuevo). GATED: sin clave (VOYAGE_API_KEY) no hace nada.
 */
@Injectable()
export class AiIndexCron {
  private readonly logger = new Logger(AiIndexCron.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly search: AiSearchService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'ai-index-nightly' })
  async runNightly(): Promise<void> {
    if (!this.search.isEnabled()) return; // sin embeddings, no-op
    const tenants = await this.system.tenant.findMany({ select: { id: true } });
    let indexed = 0;
    let docsIndexed = 0;
    for (const t of tenants) {
      try {
        const ids = await runWithTenant(t.id, () => this.search.staleMatterIds(t.id));
        for (const id of ids) {
          await runWithTenant(t.id, () => this.search.indexMatterForTenant(t.id, id)).catch((err) =>
            this.logger.warn(`No se pudo indexar ${id}: ${(err as Error).message}`),
          );
          indexed += 1;
        }
        // Backfill del CONTENIDO de documentos (texto extraído). Acotado por tenant a MAX_DOC_REINDEX_PER_RUN
        // dentro de staleDocumentIds; si se topa, el resto entra en pasadas siguientes.
        const docIds = await runWithTenant(t.id, () => this.search.staleDocumentIds(t.id));
        for (const id of docIds) {
          await runWithTenant(t.id, () =>
            this.search.reindexDocumentContentForTenant(t.id, id),
          ).catch((err) =>
            this.logger.warn(`No se pudo indexar el documento ${id}: ${(err as Error).message}`),
          );
          docsIndexed += 1;
        }
      } catch (err) {
        this.logger.error(`Fallo reindexando el tenant ${t.id}`, err as Error);
      }
    }
    if (indexed || docsIndexed)
      this.logger.log(
        `Reindexado nocturno: ${indexed} expediente(s), ${docsIndexed} documento(s).`,
      );
  }
}
