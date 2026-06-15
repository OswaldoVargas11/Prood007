import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  createSystemPrisma,
  createTenantAwarePrisma,
  PrismaService,
  SystemPrismaService,
} from './prisma.service';

/**
 * Provee dos clientes Prisma:
 *  - `PrismaService`: cliente "tenant-aware" (rol de mínimo privilegio); fija `app.tenant_id` por
 *    operación → RLS se aplica. Es el que usan todos los servicios de negocio.
 *  - `SystemPrismaService`: cliente de sistema (rol BYPASSRLS) para las rutas cross-tenant legítimas
 *    sin contexto (login/registro/carga de token). Ver D-020.
 *
 * Se usa `useFactory` (en vez de `useClass`) porque el cliente tenant-aware lleva una extensión
 * (`$extends`) que produce un objeto, no una instancia de clase. El ciclo de vida (connect/disconnect)
 * lo gestiona el propio módulo.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async () => {
        const client = createTenantAwarePrisma();
        await (client as unknown as PrismaClient).$connect();
        return client;
      },
    },
    {
      provide: SystemPrismaService,
      useFactory: async () => {
        const client = createSystemPrisma();
        await client.$connect();
        return client;
      },
    },
  ],
  exports: [PrismaService, SystemPrismaService],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SystemPrismaService) private readonly system: SystemPrismaService,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await (this.prisma as unknown as PrismaClient).$disconnect();
    await this.system.$disconnect();
  }
}
