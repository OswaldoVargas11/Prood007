import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RLS FAIL-CLOSED a nivel de BD para las tablas de DUNNING (`DunningRule`, `DunningReminder`).
 *
 * Las policies `tenant_isolation` de estas tablas las define el SQL a mano de la migración
 * `20260616120000_dunning` (Prisma NO gestiona policies), así que el check de Migration Drift valida
 * la estructura pero NO la corrección del aislamiento: eso lo demuestra este test ejercitándolas.
 *
 * Verifica, fijando `app.tenant_id` en transacción (rol `legalflow_app`): lectura acotada al tenant,
 * invisibilidad cross-tenant, rechazo de INSERT por WITH CHECK, y que SIN contexto NO se ve NINGUNA
 * fila (fail-closed, D-020). La siembra cross-tenant usa el rol de SISTEMA (BYPASSRLS), no la ausencia
 * de contexto.
 */
describe('RLS dunning a nivel de BD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;

  const unique = Date.now();
  let tenantAId: string;
  let tenantBId: string;
  let ruleAId: string;
  let ruleBId: string;
  let reminderAId: string;
  let reminderBId: string;
  let invoiceBId: string;

  const setTenant = (tx: { $executeRaw: PrismaService['$executeRaw'] }, tenantId: string) =>
    tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

  // Siembra (vía rol de SISTEMA) un tenant completo con cliente → expediente → factura → regla y
  // recordatorio de dunning, y devuelve los ids de la regla y el recordatorio (y la factura).
  const seedTenant = async (name: string, jurisdiction: 'es' | 'do', currency: 'EUR' | 'DOP') => {
    const tenant = await system.tenant.create({ data: { name, jurisdiction, currency } });
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
    const invoice = await system.invoice.create({
      data: {
        tenantId: tenant.id,
        matterId: matter.id,
        clientId: client.id,
        number: `INV-${name}-${unique}`,
        issueDate: new Date(),
        currency,
        invoiceFormat: jurisdiction,
        taxableBase: 100,
        taxAmount: 21,
        total: 121,
      },
    });
    const rule = await system.dunningRule.create({
      data: { tenantId: tenant.id, offsetDays: 7, severity: 'WARNING' },
    });
    const reminder = await system.dunningReminder.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        ruleId: rule.id,
        offsetDays: 7,
        severity: 'WARNING',
        scheduledFor: new Date(),
      },
    });
    return { tenantId: tenant.id, ruleId: rule.id, reminderId: reminder.id, invoiceId: invoice.id };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await seedTenant(`DUN-A-${unique}`, 'es', 'EUR');
    const b = await seedTenant(`DUN-B-${unique}`, 'do', 'DOP');
    tenantAId = a.tenantId;
    tenantBId = b.tenantId;
    ruleAId = a.ruleId;
    ruleBId = b.ruleId;
    reminderAId = a.reminderId;
    reminderBId = b.reminderId;
    invoiceBId = b.invoiceId;
  });

  afterAll(async () => {
    // Cascada por el rol de SISTEMA: borrar el tenant elimina cliente/expediente/factura/reglas/recordatorios.
    if (tenantAId) await system.tenant.delete({ where: { id: tenantAId } }).catch(() => undefined);
    if (tenantBId) await system.tenant.delete({ where: { id: tenantBId } }).catch(() => undefined);
    await app.close();
  });

  it('DunningRule: con contexto de A, solo ve sus reglas (la de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const rules = await tx.dunningRule.findMany();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.tenantId === tenantAId)).toBe(true);
      expect(rules.some((r) => r.id === ruleBId)).toBe(false);
      expect(await tx.dunningRule.findUnique({ where: { id: ruleBId } })).toBeNull();
    });
  });

  it('DunningReminder: con contexto de A, solo ve sus recordatorios (el de B es invisible)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenant(tx, tenantAId);
      const reminders = await tx.dunningReminder.findMany();
      expect(reminders.length).toBeGreaterThan(0);
      expect(reminders.every((r) => r.tenantId === tenantAId)).toBe(true);
      expect(reminders.some((r) => r.id === reminderBId)).toBe(false);
      expect(await tx.dunningReminder.findUnique({ where: { id: reminderBId } })).toBeNull();
    });
  });

  it('WITH CHECK: con contexto de A, no se puede insertar una DunningRule del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.dunningRule.create({ data: { tenantId: tenantBId, offsetDays: 99 } });
      }),
    ).rejects.toThrow();
  });

  it('WITH CHECK: con contexto de A, no se puede insertar un DunningReminder del tenant B', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await setTenant(tx, tenantAId);
        await tx.dunningReminder.create({
          data: {
            tenantId: tenantBId,
            invoiceId: invoiceBId,
            offsetDays: 15,
            severity: 'FINAL',
            scheduledFor: new Date(),
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('FAIL-CLOSED: sin contexto de tenant (rol app), NO se ve NINGUNA fila de dunning', async () => {
    const rules = await prisma.dunningRule.findMany({ where: { id: { in: [ruleAId, ruleBId] } } });
    expect(rules).toHaveLength(0);
    const reminders = await prisma.dunningReminder.findMany({
      where: { id: { in: [reminderAId, reminderBId] } },
    });
    expect(reminders).toHaveLength(0);
  });

  it('FAIL-CLOSED: sin contexto, un INSERT de DunningRule se rechaza por WITH CHECK', async () => {
    await expect(
      prisma.dunningRule.create({ data: { tenantId: tenantAId, offsetDays: 30 } }),
    ).rejects.toThrow();
  });

  it('el rol de SISTEMA (BYPASSRLS) sí ve las reglas de ambos tenants (ruta legítima)', async () => {
    const rules = await system.dunningRule.findMany({ where: { id: { in: [ruleAId, ruleBId] } } });
    expect(rules.map((r) => r.id).sort()).toEqual([ruleAId, ruleBId].sort());
  });
});
