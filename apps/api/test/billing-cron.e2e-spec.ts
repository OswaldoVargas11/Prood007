import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { BillingCron } from '../src/billing/billing.cron';

/**
 * Facturación programada · PR-RP5: cron de barrido multi-tenant. Emite los planes vencidos de TODOS los
 * despachos (RLS por tenant vía `runWithTenant`), reutilizando `BillingService`. Verifica: el barrido
 * emite RECURRING y SERVICE_RENDERED vencidos de varios tenants, NO toca los ADVANCE (van al cobro), y
 * respeta el aislamiento por tenant.
 */
describe('Facturación programada · cron de barrido (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  let cron: BillingCron;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const lines = [
    { description: 'Iguala', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
  ];

  async function setupTenant(suffix: string) {
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
    return { token, matterId: matter.body.id as string };
  }
  const create = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/billing/schedules').set(bearer(token)).send(body);
  const getSchedule = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/billing/schedules/${id}`).set(bearer(token));

  let tokenA = '';
  let matterA = '';
  let tokenB = '';
  let matterB = '';
  let recAId = '';
  let srvAId = '';
  let advAId = '';
  let recBId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    cron = app.get(BillingCron);
    await app.init();

    const a = await setupTenant('bcronA');
    tokenA = a.token;
    matterA = a.matterId;
    const b = await setupTenant('bcronB');
    tokenB = b.token;
    matterB = b.matterId;

    // Tenant A: recurrente acotado (2 periodos vencidos) + servicio prestado + anticipos (todos vencidos).
    recAId = (
      await create(tokenA, {
        matterId: matterA,
        type: 'RECURRING',
        intervalUnit: 'MONTHLY',
        occurrences: 2,
        startDate: '2026-01-15',
        lines,
      }).expect(201)
    ).body.id;
    srvAId = (
      await create(tokenA, {
        matterId: matterA,
        type: 'INSTALLMENTS',
        fiscalMode: 'SERVICE_RENDERED',
        intervalUnit: 'MONTHLY',
        installmentCount: 2,
        startDate: '2026-01-15',
        lines,
      }).expect(201)
    ).body.id;
    advAId = (
      await create(tokenA, {
        matterId: matterA,
        type: 'INSTALLMENTS',
        fiscalMode: 'ADVANCE',
        intervalUnit: 'MONTHLY',
        installmentCount: 2,
        startDate: '2026-01-15',
        lines,
      }).expect(201)
    ).body.id;
    // Tenant B: recurrente acotado (1 periodo vencido).
    recBId = (
      await create(tokenB, {
        matterId: matterB,
        type: 'RECURRING',
        intervalUnit: 'MONTHLY',
        occurrences: 1,
        startDate: '2026-01-15',
        lines,
      }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('el barrido emite los planes vencidos de varios tenants y respeta tipos y aislamiento', async () => {
    const summary = await cron.sweep();
    // El resumen cubre todos los tenants del sistema; al menos los nuestros se barrieron y emitieron.
    expect(summary.tenants).toBeGreaterThanOrEqual(2);
    expect(summary.emitted).toBeGreaterThanOrEqual(4); // A: 2 recurrente + 1 servicio · B: 1 recurrente

    // Tenant A · recurrente acotado → cerrado, 2 cuotas EMITTED con factura.
    const recA = await getSchedule(tokenA, recAId).expect(200);
    expect(recA.body.status).toBe('COMPLETED');
    expect(recA.body.installments.every((i: { status: string }) => i.status === 'EMITTED')).toBe(
      true,
    );
    expect(recA.body.installments.every((i: { invoiceId: string }) => i.invoiceId)).toBe(true);

    // Tenant A · servicio prestado → factura única emitida (cuotas ligadas), sin más emisiones.
    const srvA = await getSchedule(tokenA, srvAId).expect(200);
    expect(srvA.body.nextRunAt).toBeNull();
    expect(srvA.body.installments.every((i: { invoiceId: string }) => i.invoiceId)).toBe(true);

    // Tenant A · ANTICIPOS → el cron NO lo toca (su emisión va al cobro): intacto.
    const advA = await getSchedule(tokenA, advAId).expect(200);
    expect(advA.body.status).toBe('ACTIVE');
    expect(advA.body.installments.every((i: { invoiceId: string | null }) => !i.invoiceId)).toBe(
      true,
    );

    // Tenant B · recurrente → también emitido (cross-tenant), cerrado.
    const recB = await getSchedule(tokenB, recBId).expect(200);
    expect(recB.body.status).toBe('COMPLETED');
    expect(recB.body.installments[0].invoiceId).toBeTruthy();
  });

  it('idempotencia: un segundo barrido no re-emite (nada vencido pendiente)', async () => {
    const summary = await cron.sweep();
    // Tras el primer barrido, nuestros planes ya no tienen periodos vencidos pendientes.
    // (Otros tenants podrían aportar, pero nuestros no.) Verificamos que A-recurrente sigue cerrado.
    void summary;
    const recA = await getSchedule(tokenA, recAId).expect(200);
    expect(recA.body.status).toBe('COMPLETED');
    expect(recA.body.installments).toHaveLength(2); // no se generaron cuotas nuevas (acotado)
  });
});
