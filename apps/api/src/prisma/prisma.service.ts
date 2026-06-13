import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — cliente único de Prisma para toda la app.
 *
 * NOTA multi-tenant (E1): el aislamiento por `tenantId` se aplica en la capa de repositorio/
 * servicios (todas las queries filtran por tenantId del TenantContext). Camino a Postgres RLS
 * documentado en DECISIONS D-004; cuando se active, aquí se ejecutará
 * `SET app.tenant_id = ...` por conexión/transacción.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
