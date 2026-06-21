import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemPrismaService } from '../prisma/prisma.service';
import { runWithTenant } from '../prisma/tenant-context';
import { AiSearchService } from './ai-search.service';

/**
 * Reindexado nocturno del corpus de búsqueda semántica del despacho: (re)indexa los expedientes activos
 * sin vectores o modificados desde el último indexado, para que "¿hemos llevado un caso así antes?" busque
 * sobre datos al día sin reindexar a mano. GATED: sin clave de embeddings (VOYAGE_API_KEY) no hace nada.
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
    for (const t of tenants) {
      try {
        const ids = await runWithTenant(t.id, () => this.search.staleMatterIds(t.id));
        for (const id of ids) {
          await runWithTenant(t.id, () => this.search.indexMatterForTenant(t.id, id)).catch((err) =>
            this.logger.warn(`No se pudo indexar ${id}: ${(err as Error).message}`),
          );
          indexed += 1;
        }
      } catch (err) {
        this.logger.error(`Fallo reindexando el tenant ${t.id}`, err as Error);
      }
    }
    if (indexed) this.logger.log(`Reindexado nocturno: ${indexed} expediente(s).`);
  }
}
