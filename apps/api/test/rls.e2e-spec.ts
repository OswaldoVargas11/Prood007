import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Prueba de Row-Level Security a NIVEL DE BASE DE DATOS (defensa en profundidad), FAIL-CLOSED.
 *
 * Verifica las políticas `tenant_isolation` directamente: fijando `app.tenant_id` en una
 * transacción (rol `legalflow_app`) y comprobando que Postgres no deja ver ni escribir filas de
 * otro tenant, y que SIN contexto NO se ve NINGUNA fila (fail-closed, D-020). La siembra cross-tenant
 * usa el cliente de SISTEMA (rol BYPASSRLS), NO la ausencia de contexto.
 */
describe('RLS a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;

  const unique = Date.now();
  let tenantAId: string;
  let tenantBId: string;
  let clientAId: string;
  let clientBId: string;

  const setTenant = (tx: { $executeRaw: PrismaService['$executeRaw'] }, tenantId: string) =>
    tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    // Siembra cross-tenant por el rol de SISTEMA (BYPASSRLS), no por ausencia de contexto.
    const tenantA = await system.tenant.create({
      data: { name: `RLS-A-${unique}`, jurisdiction: 'es', currency: 'EUR' },
    });
    const tenantB = await system.tenant.create({
      data: { name: `RLS-B-${unique}`, jurisdiction: 'do', currency: 'DOP' },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const clientA = await system.client.create({
      data: { tenantId: tenantAId, name: 'Cliente A', taxId: `A-${unique}` },
    });
    const clientB = await system.client.create({
      data: { tenantId: tenantBId, name: 'Cliente B', taxId: `B-${unique}` },
    });
    clientAId = clientA.id;
    clientBId = clientB.id;
  });

  afterAll(async () => {
    // Limpieza por el rol de SISTEMA (BYPASSRLS). Cascada elimina los clientes.
    if (tenantAId) await system.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await system.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('con app.tenant_id = A, solo ve clientes del tenant A', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const clients = await tx.client.findMany();
      expect(clients.length).toBeGreaterThan(0);
      expect(clients.every((c) => c.tenantId === tenantAId)).toBe(true);
      expect(clients.some((c) => c.id === clientBId)).toBe(false);
    });
  });

  it('con app.tenant_id = A, un cliente de B es invisible al buscarlo por id', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const other = await tx.client.findUnique({ where: { id: clientBId } });
      expect(other).toBeNull();
    });
  });

  it('WITH CHECK: con contexto de A, no se puede insertar una fila del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.client.create({
          data: { tenantId: tenantBId, name: 'Intruso', taxId: `X-${unique}` },
        });
      }),
    ).rejects.toThrow();
  });

  it('Tenant: con contexto de A, no se ve la fila del tenant B', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const visible = await tx.tenant.findMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      expect(visible.map((t) => t.id)).toEqual([tenantAId]);
    });
  });

  it('FAIL-CLOSED: sin contexto de tenant (rol app), NO se ve NINGUNA fila', async () => {
    // El rol de mínimo privilegio (legalflow_app) sin `app.tenant_id` fijado → cero filas.
    const clients = await prisma.client.findMany({
      where: { id: { in: [clientAId, clientBId] } },
    });
    expect(clients).toHaveLength(0);

    const tenants = await prisma.tenant.findMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    expect(tenants).toHaveLength(0);
  });

  it('FAIL-CLOSED: sin contexto, un INSERT se rechaza por WITH CHECK', async () => {
    await expect(
      prisma.client.create({
        data: { tenantId: tenantAId, name: 'Sin contexto', taxId: `NC-${unique}` },
      }),
    ).rejects.toThrow();
  });

  it('el rol de SISTEMA (BYPASSRLS) sí ve ambos tenants (ruta cross-tenant legítima)', async () => {
    const clients = await system.client.findMany({
      where: { id: { in: [clientAId, clientBId] } },
    });
    expect(clients.map((c) => c.id).sort()).toEqual([clientAId, clientBId].sort());
  });
});
