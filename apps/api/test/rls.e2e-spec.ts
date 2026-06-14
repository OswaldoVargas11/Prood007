import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Prueba de Row-Level Security a NIVEL DE BASE DE DATOS (defensa en profundidad).
 *
 * Verifica las políticas `tenant_isolation` directamente: fijando `app.tenant_id` en una
 * transacción y comprobando que Postgres no deja ver ni escribir filas de otro tenant. NO depende
 * todavía del wiring de la app (ese se prueba por HTTP en otra suite); aquí confirmamos que las
 * políticas SQL son correctas y que el bypass sin contexto (rutas de sistema) funciona.
 */
describe('RLS a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    await app.init();

    // Sin contexto de tenant (ruta de sistema) → bypass → podemos sembrar ambos tenants.
    const tenantA = await prisma.tenant.create({
      data: { name: `RLS-A-${unique}`, jurisdiction: 'es', currency: 'EUR' },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: `RLS-B-${unique}`, jurisdiction: 'do', currency: 'DOP' },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const clientA = await prisma.client.create({
      data: { tenantId: tenantAId, name: 'Cliente A', taxId: `A-${unique}` },
    });
    const clientB = await prisma.client.create({
      data: { tenantId: tenantBId, name: 'Cliente B', taxId: `B-${unique}` },
    });
    clientAId = clientA.id;
    clientBId = clientB.id;
  });

  afterAll(async () => {
    // Limpieza en ruta de sistema (bypass). Cascada elimina los clientes.
    if (tenantAId) await prisma.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await prisma.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
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

  it('sin contexto (bypass de sistema), se ven filas de ambos tenants', async () => {
    const clients = await prisma.client.findMany({
      where: { id: { in: [clientAId, clientBId] } },
    });
    const ids = clients.map((c) => c.id).sort();
    expect(ids).toEqual([clientAId, clientBId].sort());
  });
});
