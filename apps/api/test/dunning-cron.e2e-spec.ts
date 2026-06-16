import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { DunningCron } from '../src/dunning/dunning.cron';

/**
 * Cron de dunning (PR-D3). El barrido corre SIN contexto de request: lista los tenants con el rol de
 * SISTEMA y evalúa cada uno dentro de `runWithTenant`, de modo que las queries del motor queden
 * acotadas por RLS al tenant correcto. Esta es la pieza de riesgo de D3 y es lo que prueba esta suite.
 */
describe('Dunning · cron diario / barrido multi-tenant (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  let cron: DunningCron;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantAId = '';
  let tenantBId = '';
  let invoiceAId = '';
  let invoiceBId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function tenantWithOverdueInvoice(suffix: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${suffix}_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `${suffix}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    const token = reg.body.tokens.accessToken as string;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(token))
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(token))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(token))
      .send({
        matterId: matter.body.id,
        dueDate: '2020-01-01',
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    return { tenantId: reg.body.tenantId as string, invoiceId: inv.body.invoice.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    cron = app.get(DunningCron);
    await app.init();

    const a = await tenantWithOverdueInvoice('cronA');
    tenantAId = a.tenantId;
    invoiceAId = a.invoiceId;
    const b = await tenantWithOverdueInvoice('cronB');
    tenantBId = b.tenantId;
    invoiceBId = b.invoiceId;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('el barrido persigue las vencidas de cada tenant bajo RLS (sin request)', async () => {
    const summary = await cron.sweep();
    expect(summary.tenants).toBeGreaterThanOrEqual(2);
    expect(summary.delivered).toBeGreaterThanOrEqual(6); // 3 etapas × 2 tenants (al menos)

    const remA = await system.dunningReminder.findMany({ where: { invoiceId: invoiceAId } });
    expect(remA).toHaveLength(3);
    expect(remA.every((r) => r.status === 'SENT')).toBe(true);
    expect(remA.every((r) => r.tenantId === tenantAId)).toBe(true);

    const remB = await system.dunningReminder.findMany({ where: { invoiceId: invoiceBId } });
    expect(remB).toHaveLength(3);
    expect(remB.every((r) => r.tenantId === tenantBId)).toBe(true);
  });

  it('un segundo barrido es idempotente (no duplica recordatorios)', async () => {
    await cron.sweep();
    const remA = await system.dunningReminder.findMany({ where: { invoiceId: invoiceAId } });
    expect(remA).toHaveLength(3);
  });
});
