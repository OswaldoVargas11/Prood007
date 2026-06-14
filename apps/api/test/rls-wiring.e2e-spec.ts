import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { runWithTenant, tenantTransaction } from '../src/prisma/tenant-context';

/**
 * Prueba el WIRING de RLS en runtime: que con un contexto de tenant activo (como en un request
 * autenticado) la extensión de Prisma fija `app.tenant_id` automáticamente y RLS aísla los datos,
 * SIN que la query lleve filtro `tenantId` explícito. Es el complemento de rls.e2e-spec (que prueba
 * las políticas a nivel de BD fijando el GUC a mano): aquí lo hace la propia app vía `runWithTenant`.
 */
describe('RLS wiring en runtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const unique = Date.now();
  let tenantAId: string;
  let tenantBId: string;
  let clientBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();

    // Semilla sin contexto (ruta de sistema → bypass): dos tenants con un cliente cada uno.
    const a = await prisma.tenant.create({
      data: { name: `WIRE-A-${unique}`, jurisdiction: 'es', currency: 'EUR' },
    });
    const b = await prisma.tenant.create({
      data: { name: `WIRE-B-${unique}`, jurisdiction: 'do', currency: 'DOP' },
    });
    tenantAId = a.id;
    tenantBId = b.id;
    await prisma.client.create({
      data: { tenantId: tenantAId, name: 'A1', taxId: `WA-${unique}` },
    });
    const cb = await prisma.client.create({
      data: { tenantId: tenantBId, name: 'B1', taxId: `WB-${unique}` },
    });
    clientBId = cb.id;
  });

  afterAll(async () => {
    if (tenantAId) await prisma.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await prisma.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('con contexto de tenant A, una query SIN filtro tenantId solo ve datos de A', async () => {
    await runWithTenant(tenantAId, async () => {
      const all = await prisma.client.findMany(); // sin where: lo acota RLS, no la app
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((c) => c.tenantId === tenantAId)).toBe(true);
    });
  });

  it('con contexto de tenant A, un cliente de B es invisible aunque se pida por id', async () => {
    await runWithTenant(tenantAId, async () => {
      const b = await prisma.client.findUnique({ where: { id: clientBId } });
      expect(b).toBeNull();
    });
  });

  it('con contexto de tenant A, crear una fila de B lo rechaza la BD (WITH CHECK)', async () => {
    await runWithTenant(tenantAId, async () => {
      await expect(
        prisma.client.create({
          data: { tenantId: tenantBId, name: 'Intruso', taxId: `WX-${unique}` },
        }),
      ).rejects.toThrow();
    });
  });

  it('tenantTransaction (multi-sentencia) respeta el aislamiento sin anidar transacciones', async () => {
    await runWithTenant(tenantAId, async () => {
      const { clients, count } = await tenantTransaction(prisma, async (tx) => {
        const clients = await tx.client.findMany();
        const count = await tx.client.count();
        return { clients, count };
      });
      expect(count).toBe(clients.length);
      expect(clients.every((c) => c.tenantId === tenantAId)).toBe(true);
    });
  });

  it('sin contexto (ruta de sistema), la extensión hace passthrough y ve ambos tenants', async () => {
    const both = await prisma.tenant.findMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    expect(both.map((t) => t.id).sort()).toEqual([tenantAId, tenantBId].sort());
  });
});
