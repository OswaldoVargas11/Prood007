import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { createTenantAwarePrisma, PrismaService } from './prisma.service';

/**
 * Provee el cliente Prisma "tenant-aware" bajo el token `PrismaService`. Se usa `useFactory` (en vez
 * de `useClass`) porque el cliente lleva una extensión (`$extends`) que produce un objeto, no una
 * instancia de clase. El ciclo de vida (connect/disconnect) lo gestiona el propio módulo.
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
  ],
  exports: [PrismaService],
})
export class PrismaModule implements OnApplicationShutdown {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async onApplicationShutdown(): Promise<void> {
    await (this.prisma as unknown as PrismaClient).$disconnect();
  }
}
