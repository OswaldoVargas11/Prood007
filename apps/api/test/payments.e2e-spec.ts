import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Cobros (Payment) de la Fase 1 · PR-3: registro manual + cobros PARCIALES + conciliación de estado de
 * la factura (PARTIAL/PAID), config de cobro online por jurisdicción, y aislamiento por tenant.
 */
describe('Payments (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let token = '';
  let matterId = '';
  let tokenB = '';

  async function setup(email: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${email}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email, password, fullName: 'Admin' },
      })
      .expect(201);
    const t = reg.body.tokens.accessToken as string;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${t}` })
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${t}` })
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    return { token: t, matterId: matter.body.id as string };
  }

  async function issueInvoice(t: string, mId: string): Promise<{ id: string; total: number }> {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set({ Authorization: `Bearer ${t}` })
      .send({
        matterId: mId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    return { id: res.body.invoice.id, total: Number(res.body.invoice.total) }; // 1000 + 210 IVA = 1210
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    void app.get(PrismaService);
    await app.init();

    const main = await setup(`pay_${unique}@d.test`);
    token = main.token;
    matterId = main.matterId;
    const b = await setup(`payb_${unique}@d.test`);
    tokenB = b.token;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('la config de cobro reporta la pasarela de la jurisdicción (ES → Stripe, online off sin clave)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/config')
      .set(auth(token))
      .expect(200);
    expect(res.body.jurisdiction).toBe('es');
    expect(res.body.method).toBe('STRIPE');
    expect(res.body.onlineEnabled).toBe(false);
  });

  it('un cobro PARCIAL deja la factura en PARTIAL con amountPaid parcial', async () => {
    const inv = await issueInvoice(token, matterId);
    const pay = await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id, amount: '500.00', note: 'Primer plazo' })
      .expect(201);
    expect(pay.body.payment.status).toBe('SUCCEEDED');
    expect(pay.body.payment.method).toBe('MANUAL');

    const got = await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${inv.id}`)
      .set(auth(token))
      .expect(200);
    expect(got.body.status).toBe('PARTIAL');
    expect(Number(got.body.amountPaid)).toBe(500);
    expect(got.body.paidAt).toBeNull();
  });

  it('cobrar el resto deja la factura en PAID con amountPaid = total y paidAt', async () => {
    const inv = await issueInvoice(token, matterId);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id, amount: '200.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id }) // sin amount → cobra el saldo pendiente
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${inv.id}`)
      .set(auth(token))
      .expect(200);
    expect(got.body.status).toBe('PAID');
    expect(Number(got.body.amountPaid)).toBe(inv.total);
    expect(got.body.paidAt).toBeTruthy();
  });

  it('cobrar más que el saldo pendiente responde 400', async () => {
    const inv = await issueInvoice(token, matterId);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id, amount: '99999.00' })
      .expect(400);
  });

  it('cobrar una factura ya pagada por completo responde 400', async () => {
    const inv = await issueInvoice(token, matterId);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id, amount: '10.00' })
      .expect(400);
  });

  it('lista los cobros de una factura', async () => {
    const inv = await issueInvoice(token, matterId);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(token))
      .send({ invoiceId: inv.id, amount: '100.00' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/payments/by-invoice/${inv.id}`)
      .set(auth(token))
      .expect(200);
    expect(res.body.length).toBe(1);
    expect(Number(res.body[0].amount)).toBe(100);
  });

  it('el atajo /ledger/invoices/:id/pay sigue marcando PAID y registra un Payment', async () => {
    const inv = await issueInvoice(token, matterId);
    const paid = await request(app.getHttpServer())
      .post(`/api/ledger/invoices/${inv.id}/pay`)
      .set(auth(token))
      .expect(201);
    expect(paid.body.status).toBe('PAID');
    const res = await request(app.getHttpServer())
      .get(`/api/payments/by-invoice/${inv.id}`)
      .set(auth(token))
      .expect(200);
    expect(res.body.length).toBe(1);
  });

  it('AISLAMIENTO: el tenant B no puede cobrar una factura del tenant A (404)', async () => {
    const inv = await issueInvoice(token, matterId);
    await request(app.getHttpServer())
      .post('/api/payments')
      .set(auth(tokenB))
      .send({ invoiceId: inv.id, amount: '100.00' })
      .expect(404);
  });
});
