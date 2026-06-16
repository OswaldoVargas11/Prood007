import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Facturación programada · PR-RP4b: plan de pago por ANTICIPOS (INSTALLMENTS · ADVANCE). Cada cuota se
 * COBRA y, al cobrar, emite su factura de anticipo (devengo al cobro) acreditando el retainer, reutilizando
 * `RetainerService.depositAnticipo`. Verifica: emisión de anticipo por cuota + crédito al retainer,
 * claim-first (no doble cobro), cierre del plan, guards y role-gating.
 */
describe('Facturación programada · plan de pago por anticipos (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientToken = '';
  let matterId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const create = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/billing/schedules').set(bearer(token)).send(body);
  const collect = (token: string, installmentId: string) =>
    request(app.getHttpServer())
      .post(`/api/billing/installments/${installmentId}/collect`)
      .set(bearer(token));
  const getSchedule = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/billing/schedules/${id}`).set(bearer(token));
  const getInvoice = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/ledger/invoices/${id}`).set(bearer(token));
  const getRetainer = (token: string, mId: string) =>
    request(app.getHttpServer()).get(`/api/retainer/matter/${mId}`).set(bearer(token));

  const lines = [
    { description: 'Honorarios', quantity: '1', unitPrice: '900', taxCode: 'IVA_STANDARD' },
  ];

  async function newAdvancePlan() {
    const sch = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'ADVANCE',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-15',
      lines, // base 900 → 3 cuotas de 300
    }).expect(201);
    return sch.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho badv_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `badv_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    adminToken = reg.body.tokens.accessToken;
    const tenantId = reg.body.tenantId;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `badvc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `badvc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('cobrar una cuota emite su factura de anticipo (devengo al cobro) y acredita el retainer', async () => {
    const plan = await newAdvancePlan();
    const inst = plan.installments[0];

    const res = await collect(adminToken, inst.id).expect(201);
    // Anticipo de 300 → 300 base + 63 IVA = 363; saldo del retainer acreditado por el total.
    expect(res.body.total).toBe('363.00');
    expect(res.body.balance).toBe('363.00');
    expect(res.body.completed).toBe(false);

    // La factura de anticipo nace PAID (depositAnticipo).
    const invoice = await getInvoice(adminToken, res.body.invoiceId).expect(200);
    expect(invoice.body.status).toBe('PAID');
    expect(Number(invoice.body.total)).toBe(363);

    // La cuota queda COBRADA y ligada; el plan avanza a la siguiente.
    const after = await getSchedule(adminToken, plan.id).expect(200);
    const paid = after.body.installments.find((i: { id: string }) => i.id === inst.id);
    expect(paid.status).toBe('PAID');
    expect(paid.invoiceId).toBe(res.body.invoiceId);
    expect(after.body.status).toBe('ACTIVE');

    // El retainer del expediente refleja el anticipo cobrado.
    const ret = await getRetainer(adminToken, matterId).expect(200);
    expect(Number(ret.body.balance)).toBe(363);
  });

  it('claim-first: cobrar la misma cuota dos veces se rechaza (no doble anticipo)', async () => {
    const plan = await newAdvancePlan();
    const inst = plan.installments[0];
    await collect(adminToken, inst.id).expect(201);
    await collect(adminToken, inst.id).expect(400);
  });

  it('cobrar todas las cuotas cierra el plan (COMPLETED)', async () => {
    const plan = await newAdvancePlan();
    for (const inst of plan.installments) {
      await collect(adminToken, inst.id).expect(201);
    }
    const after = await getSchedule(adminToken, plan.id).expect(200);
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.nextRunAt).toBeNull();
    expect(after.body.installments.every((i: { status: string }) => i.status === 'PAID')).toBe(
      true,
    );
  });

  it('guard: cobrar una cuota de un plan NO-anticipo se rechaza (400)', async () => {
    const sr = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'SERVICE_RENDERED',
      intervalUnit: 'MONTHLY',
      installmentCount: 2,
      startDate: '2026-01-15',
      lines,
    }).expect(201);
    await collect(adminToken, sr.body.installments[0].id).expect(400);
  });

  it('role-gating: un usuario CLIENT no puede cobrar una cuota (403)', async () => {
    const plan = await newAdvancePlan();
    await collect(clientToken, plan.installments[0].id).expect(403);
  });
});
