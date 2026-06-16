import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RLS FAIL-CLOSED a nivel de BD para las tablas de RETAINER (`RetainerAccount`, `RetainerEntry`).
 * Las policies `tenant_isolation` las define el SQL a mano de la migración `20260616130000_retainer`
 * (Prisma no gestiona policies), así que Migration Drift valida la estructura pero NO el aislamiento:
 * eso lo demuestra este test ejercitándolas (lectura acotada, cross-tenant invisible, WITH CHECK,
 * fail-closed sin contexto). Siembra cross-tenant por el rol de SISTEMA (BYPASSRLS).
 */
describe('RLS retainer a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;

  const unique = Date.now();
  let tenantAId = '';
  let tenantBId = '';
  let accountAId = '';
  let accountBId = '';
  let entryAId = '';
  let entryBId = '';

  const setTenant = (tx: { $executeRaw: PrismaService['$executeRaw'] }, tenantId: string) =>
    tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  const seedTenant = async (name: string, currency: 'EUR' | 'DOP') => {
    const tenant = await system.tenant.create({
      data: { name, jurisdiction: currency === 'EUR' ? 'es' : 'do', currency },
    });
    const client = await system.client.create({
      data: { tenantId: tenant.id, name: `Cli-${name}`, taxId: `${name}-${unique}` },
    });
    const matter = await system.matter.create({
      data: {
        tenantId: tenant.id,
        reference: `M-${name}-${unique}`,
        title: 'Asunto',
        type: 'civil',
        clientId: client.id,
      },
    });
    // Retainer POR EXPEDIENTE (matterId @unique). Moneda = la del tenant (mono-moneda).
    const account = await system.retainerAccount.create({
      data: { tenantId: tenant.id, matterId: matter.id, currency, balance: 100 },
    });
    const entry = await system.retainerEntry.create({
      data: { tenantId: tenant.id, accountId: account.id, type: 'DEPOSIT', amount: 100 },
    });
    return { tenantId: tenant.id, accountId: account.id, entryId: entry.id };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await seedTenant(`RET-A-${unique}`, 'EUR');
    const b = await seedTenant(`RET-B-${unique}`, 'DOP');
    tenantAId = a.tenantId;
    tenantBId = b.tenantId;
    accountAId = a.accountId;
    accountBId = b.accountId;
    entryAId = a.entryId;
    entryBId = b.entryId;
  });

  afterAll(async () => {
    if (tenantAId) await system.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await system.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('RetainerAccount: con contexto de A, solo ve su cuenta (la de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const accounts = await tx.retainerAccount.findMany();
      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts.every((a) => a.tenantId === tenantAId)).toBe(true);
      expect(await tx.retainerAccount.findUnique({ where: { id: accountBId } })).toBeNull();
    });
  });

  it('RetainerEntry: con contexto de A, solo ve sus movimientos (el de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const entries = await tx.retainerEntry.findMany();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.tenantId === tenantAId)).toBe(true);
      expect(entries.some((e) => e.id === entryBId)).toBe(false);
    });
  });

  it('WITH CHECK: con contexto de A, no se puede insertar un RetainerEntry del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.retainerEntry.create({
          data: {
            tenantId: tenantBId,
            accountId: accountBId,
            type: 'ADJUSTMENT',
            amount: 1,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('FAIL-CLOSED: sin contexto de tenant (rol app), NO se ve NINGUNA fila de retainer', async () => {
    const accounts = await prisma.retainerAccount.findMany({
      where: { id: { in: [accountAId, accountBId] } },
    });
    expect(accounts).toHaveLength(0);
    const entries = await prisma.retainerEntry.findMany({
      where: { id: { in: [entryAId, entryBId] } },
    });
    expect(entries).toHaveLength(0);
  });

  it('el rol de SISTEMA (BYPASSRLS) sí ve las cuentas de ambos tenants', async () => {
    const accounts = await system.retainerAccount.findMany({
      where: { id: { in: [accountAId, accountBId] } },
    });
    expect(accounts.map((a) => a.id).sort()).toEqual([accountAId, accountBId].sort());
  });
});
