import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Retainer · PR-R3a: aplicar saldo de provisión (SUPLIDO/GENERICO) al cobro de una factura. Crea un
 * Payment RETAINER + APPLICATION(−). BLOQUEO POR CONSTRUCCIÓN: si el expediente tiene fondos de
 * ANTICIPO (ya facturados), aplicar requiere la deducción fiscal (R3b) → 400. Cubre invariante y role.
 */
describe('Retainer · aplicar provisión a factura (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientToken = '';
  let matterId = '';
  let invoiceId = '';
  let anticipoMatterId = '';
  let anticipoInvoiceId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newInvoice(token: string, mId: string, unitPrice: string) {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(token))
      .send({
        matterId: mId,
        lines: [{ description: 'Honorarios', quantity: '1', unitPrice, taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    return inv.body.invoice.id as string;
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
        tenantName: `Despacho rapp_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `rapp_${unique}@d.test`, password, fullName: 'Admin' },
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
      .send({ email: `rappc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `rappc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
    // Factura del expediente: base 500 + IVA 105 = 605.
    invoiceId = await newInvoice(adminToken, matterId, '500');
    // Provisión NO fiscal disponible: 1000 (GENERICO).
    await request(app.getHttpServer())
      .post('/api/retainer/deposit')
      .set(bearer(adminToken))
      .send({ matterId, amount: '1000.00', kind: 'GENERICO' })
      .expect(201);

    // Expediente con ANTICIPO (para el bloqueo).
    const m2 = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto 2', type: 'civil', clientId: client.body.id })
      .expect(201);
    anticipoMatterId = m2.body.id;
    const ant = await request(app.getHttpServer())
      .post('/api/retainer/anticipo')
      .set(bearer(adminToken))
      .send({ matterId: anticipoMatterId, amount: '300.00' })
      .expect(201);
    anticipoInvoiceId = ant.body.invoiceId;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const apply = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/apply').set(bearer(token)).send(body);

  it('aplica una parte: la factura queda PARTIAL y el saldo baja', async () => {
    const res = await apply(adminToken, { matterId, invoiceId, amount: '200.00' }).expect(201);
    expect(res.body.applied).toBe('200.00');
    expect(res.body.invoiceStatus).toBe('PARTIAL');
    expect(res.body.balance).toBe('800.00'); // 1000 − 200
  });

  it('aplica el resto (por defecto, el pendiente): la factura queda PAID', async () => {
    const res = await apply(adminToken, { matterId, invoiceId }).expect(201);
    expect(res.body.applied).toBe('405.00'); // pendiente: 605 − 200
    expect(res.body.invoiceStatus).toBe('PAID');
    expect(res.body.balance).toBe('395.00'); // 800 − 405

    // Invariante a nivel BD: saldo cacheado == Σ(amount de movimientos).
    const account = await system.retainerAccount.findFirstOrThrow({
      where: { matterId },
      include: { entries: true },
    });
    const sum = account.entries.reduce((s, e) => s + Number(e.amount), 0);
    expect(Number(account.balance)).toBeCloseTo(sum, 2);
    expect(Number(account.balance)).toBeCloseTo(395, 2);
  });

  it('saldo insuficiente: aplicar más que el saldo disponible se rechaza (400)', async () => {
    const inv2 = await newInvoice(adminToken, matterId, '1000'); // 1210 pendiente
    await apply(adminToken, { matterId, invoiceId: inv2, amount: '1000.00' }).expect(400); // saldo 395
  });

  it('BLOQUEO ANTICIPO: aplicar saldo de un expediente con anticipo se rechaza (400)', async () => {
    await apply(adminToken, {
      matterId: anticipoMatterId,
      invoiceId: anticipoInvoiceId,
    }).expect(400);
  });

  it('factura de otro expediente: se rechaza (400)', async () => {
    await apply(adminToken, { matterId, invoiceId: anticipoInvoiceId }).expect(400);
  });

  it('role-gating: un usuario CLIENT no puede aplicar provisión (403)', async () => {
    await apply(clientToken, { matterId, invoiceId, amount: '10.00' }).expect(403);
  });
});
