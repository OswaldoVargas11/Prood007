import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Motor de dunning (PR-D2): "recordar ahora" persigue las facturas vencidas según el calendario por
 * defecto (+1/+7/+15) y genera/entrega los recordatorios IN_APP. Cubre lo crítico de la revisión:
 * idempotencia (doble clic no duplica ni rompe), auditoría de cada envío, role-gating y aislamiento.
 */
describe('Dunning · motor + recordar ahora (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let tenantId = '';
  let clientToken = '';
  let overdueInvoiceId = '';

  // Tenant B (aislamiento).
  let adminTokenB = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerTenant(suffix: string) {
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
    return { token: reg.body.tokens.accessToken as string, tenantId: reg.body.tenantId as string };
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

    const main = await registerTenant('dun');
    adminToken = main.token;
    tenantId = main.tenantId;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente vencido', taxId: '12345678Z' })
      .expect(201);
    // Usuario de portal (rol CLIENT) para probar el role-gating.
    await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `dunclient_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `dunclient_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    // Factura con vencimiento muy pasado → las tres etapas (+1/+7/+15) aplican.
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId: matter.body.id,
        dueDate: '2020-01-01',
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    overdueInvoiceId = inv.body.invoice.id;

    const b = await registerTenant('dunb');
    adminTokenB = b.token;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('sin token, "recordar ahora" responde 401', async () => {
    await request(app.getHttpServer()).post('/api/dunning/run').expect(401);
  });

  it('role-gating: un usuario CLIENT no puede disparar dunning (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/dunning/run')
      .set(bearer(clientToken))
      .expect(403);
  });

  it('"recordar ahora" evalúa las vencidas y entrega las tres etapas (+1/+7/+15)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dunning/run')
      .set(bearer(adminToken))
      .expect(201);
    expect(res.body.evaluated).toBeGreaterThanOrEqual(1);
    expect(res.body.delivered).toBe(3);
    expect(res.body.failed).toBe(0);
  });

  it('genera exactamente un recordatorio por etapa, en estado SENT (sin duplicados)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/dunning/reminders?invoiceId=${overdueInvoiceId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(3);
    expect(
      (res.body as { offsetDays: number }[]).map((r) => r.offsetDays).sort((a, b) => a - b),
    ).toEqual([1, 7, 15]);
    expect(res.body.every((r: { status: string }) => r.status === 'SENT')).toBe(true);
  });

  it('IDEMPOTENCIA: pulsar "recordar" de nuevo no crea duplicados ni lanza 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dunning/run')
      .set(bearer(adminToken))
      .expect(201);
    expect(res.body.created).toBe(0);
    expect(res.body.delivered).toBe(0);
    const after = await request(app.getHttpServer())
      .get(`/api/dunning/reminders?invoiceId=${overdueInvoiceId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(after.body).toHaveLength(3);
  });

  it('cada recordatorio entregado deja traza en auditoría (dunning.reminder_sent)', async () => {
    const logs = await system.auditLog.findMany({
      where: { tenantId, action: 'dunning.reminder_sent' },
    });
    expect(logs).toHaveLength(3);
  });

  it('AISLAMIENTO: el tenant B no ve los recordatorios del tenant A', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dunning/reminders')
      .set(bearer(adminTokenB))
      .expect(200);
    expect(res.body).toHaveLength(0);
  });
});
