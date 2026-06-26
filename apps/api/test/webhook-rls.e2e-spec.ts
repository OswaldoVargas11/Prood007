import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RLS FAIL-CLOSED a nivel de BD para los endpoints de WEBHOOK SALIENTE (`WebhookEndpoint`). La policy
 * `tenant_isolation` la define el SQL a mano de la migración `20260627120000_webhook_endpoints` (Prisma
 * no gestiona policies), así que Migration Drift valida la ESTRUCTURA pero NO el aislamiento: eso lo
 * demuestra este test ejercitándola (lectura acotada, cross-tenant invisible, WITH CHECK, fail-closed sin
 * contexto). Siembra cross-tenant por el rol de SISTEMA (BYPASSRLS).
 */
describe('RLS webhooks salientes a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;

  const unique = Date.now();
  let tenantAId = '';
  let tenantBId = '';
  let endpointAId = '';
  let endpointBId = '';

  const setTenant = (tx: { $executeRaw: PrismaService['$executeRaw'] }, tenantId: string) =>
    tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  const seedTenant = async (name: string) => {
    const tenant = await system.tenant.create({
      data: { name, jurisdiction: 'es', currency: 'EUR' },
    });
    const endpoint = await system.webhookEndpoint.create({
      data: {
        tenantId: tenant.id,
        url: `https://hooks.example.com/${name}`,
        secret: `whsec_${name}`,
        events: 'matter.created',
      },
    });
    return { tenantId: tenant.id, endpointId: endpoint.id };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await seedTenant(`WH-A-${unique}`);
    const b = await seedTenant(`WH-B-${unique}`);
    tenantAId = a.tenantId;
    tenantBId = b.tenantId;
    endpointAId = a.endpointId;
    endpointBId = b.endpointId;
  });

  afterAll(async () => {
    if (tenantAId) await system.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await system.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('con contexto de A, solo ve su endpoint (el de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const endpoints = await tx.webhookEndpoint.findMany();
      expect(endpoints.length).toBeGreaterThan(0);
      expect(endpoints.every((e) => e.tenantId === tenantAId)).toBe(true);
      expect(await tx.webhookEndpoint.findUnique({ where: { id: endpointBId } })).toBeNull();
    });
  });

  it('WITH CHECK: con contexto de A, no se puede insertar un endpoint del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.webhookEndpoint.create({
          data: {
            tenantId: tenantBId,
            url: 'https://hooks.example.com/evil',
            secret: 'whsec_evil',
            events: 'matter.created',
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('FAIL-CLOSED: sin contexto de tenant, no se ve NINGÚN endpoint', async () => {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { id: { in: [endpointAId, endpointBId] } },
    });
    expect(endpoints).toHaveLength(0);
  });

  it('el rol de SISTEMA (BYPASSRLS) sí ve los endpoints de ambos tenants', async () => {
    const endpoints = await system.webhookEndpoint.findMany({
      where: { id: { in: [endpointAId, endpointBId] } },
    });
    expect(endpoints.map((e) => e.id).sort()).toEqual([endpointAId, endpointBId].sort());
  });
});
