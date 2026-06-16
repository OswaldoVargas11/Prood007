import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RLS FAIL-CLOSED a nivel de BD para las tablas de FACTURACIÓN PROGRAMADA (`BillingSchedule`,
 * `BillingInstallment`). Las policies `tenant_isolation` las define el SQL a mano de la migración
 * `20260616155957_billing_schedules` (Prisma no gestiona policies), así que Migration Drift valida la
 * estructura pero NO el aislamiento: eso lo demuestra este test ejercitándolas (lectura acotada,
 * cross-tenant invisible, WITH CHECK, fail-closed sin contexto). Siembra cross-tenant por el rol de
 * SISTEMA (BYPASSRLS).
 */
describe('RLS facturación programada a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;

  const unique = Date.now();
  let tenantAId = '';
  let tenantBId = '';
  let scheduleAId = '';
  let scheduleBId = '';
  let installmentAId = '';
  let installmentBId = '';

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
    const schedule = await system.billingSchedule.create({
      data: {
        tenantId: tenant.id,
        matterId: matter.id,
        clientId: client.id,
        currency,
        type: 'RECURRING',
        intervalUnit: 'MONTHLY',
        lines: [
          { description: 'Iguala', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
        startDate: new Date('2026-01-01'),
        nextRunAt: new Date('2026-01-01'),
      },
    });
    const installment = await system.billingInstallment.create({
      data: {
        tenantId: tenant.id,
        scheduleId: schedule.id,
        sequence: 1,
        dueDate: new Date('2026-01-01'),
        amount: 100,
      },
    });
    return { tenantId: tenant.id, scheduleId: schedule.id, installmentId: installment.id };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await seedTenant(`BILL-A-${unique}`, 'EUR');
    const b = await seedTenant(`BILL-B-${unique}`, 'DOP');
    tenantAId = a.tenantId;
    tenantBId = b.tenantId;
    scheduleAId = a.scheduleId;
    scheduleBId = b.scheduleId;
    installmentAId = a.installmentId;
    installmentBId = b.installmentId;
  });

  afterAll(async () => {
    if (tenantAId) await system.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await system.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('BillingSchedule: con contexto de A, solo ve su plan (el de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const schedules = await tx.billingSchedule.findMany();
      expect(schedules.length).toBeGreaterThan(0);
      expect(schedules.every((s) => s.tenantId === tenantAId)).toBe(true);
      expect(await tx.billingSchedule.findUnique({ where: { id: scheduleBId } })).toBeNull();
    });
  });

  it('BillingInstallment: con contexto de A, solo ve sus cuotas (la de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const installments = await tx.billingInstallment.findMany();
      expect(installments.length).toBeGreaterThan(0);
      expect(installments.every((i) => i.tenantId === tenantAId)).toBe(true);
      expect(installments.some((i) => i.id === installmentBId)).toBe(false);
    });
  });

  it('WITH CHECK: con contexto de A, no se puede insertar una cuota del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.billingInstallment.create({
          data: {
            tenantId: tenantBId,
            scheduleId: scheduleBId,
            sequence: 2,
            dueDate: new Date('2026-02-01'),
            amount: 1,
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('FAIL-CLOSED: sin contexto de tenant (rol app), NO se ve NINGUNA fila de billing', async () => {
    const schedules = await prisma.billingSchedule.findMany({
      where: { id: { in: [scheduleAId, scheduleBId] } },
    });
    expect(schedules).toHaveLength(0);
    const installments = await prisma.billingInstallment.findMany({
      where: { id: { in: [installmentAId, installmentBId] } },
    });
    expect(installments).toHaveLength(0);
  });

  it('el rol de SISTEMA (BYPASSRLS) sí ve los planes de ambos tenants', async () => {
    const schedules = await system.billingSchedule.findMany({
      where: { id: { in: [scheduleAId, scheduleBId] } },
    });
    expect(schedules.map((s) => s.id).sort()).toEqual([scheduleAId, scheduleBId].sort());
  });
});
