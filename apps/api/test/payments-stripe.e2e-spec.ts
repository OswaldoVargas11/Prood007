import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { StripePaymentProvider } from '../src/payments/providers/stripe.provider';

/**
 * Stripe Connect (Fase 1 · PR-4) con el provider MOCKEADO (sin claves reales en CI, ver D-024). Cubre:
 * checkout exige cuenta conectada, onboarding guarda `stripeAccountId`, y el webhook concilia el cobro
 * bajo el contexto de tenant de los metadatos del evento (idempotente). La verificación EN VIVO la hace
 * el owner con sus claves.
 */
describe('Payments · Stripe Connect (e2e, mocked)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let token = '';
  let tenantId = '';
  let matterId = '';

  // Stub del provider Stripe: verifyWebhook devuelve el propio cuerpo como evento (el test controla los
  // metadatos), y el resto simula las llamadas a la API de Stripe.
  const stripeStub = {
    jurisdiction: 'es',
    method: 'STRIPE',
    isOnlineEnabled: () => true,
    createCheckout: async () => ({ url: 'https://stripe.test/checkout', providerRef: 'cs_test_1' }),
    verifyWebhook: (payload: Buffer | string) =>
      JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8')),
    createAccountLink: async () => ({
      accountId: 'acct_test_1',
      url: 'https://stripe.test/onboard',
    }),
    accountStatus: async () => ({ chargesEnabled: true, detailsSubmitted: true }),
  };

  async function issueInvoice(): Promise<{ id: string; total: number }> {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        matterId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    return { id: res.body.invoice.id, total: Number(res.body.invoice.total) }; // 1210
  }

  function sessionEvent(
    invoiceId: string,
    amountCents: number,
    opts?: { type?: string; pi?: string },
  ) {
    return {
      id: `evt_${Math.round(amountCents)}_${opts?.pi ?? 'x'}`,
      type: opts?.type ?? 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          metadata: { invoiceId, tenantId },
          amount_total: amountCents,
          payment_intent: opts?.pi ?? 'pi_test_1',
        },
      },
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StripePaymentProvider)
      .useValue(stripeStub)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho stripe_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `stripe_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    token = reg.body.tokens.accessToken;
    tenantId = reg.body.tenantId;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
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

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('checkout falla si el despacho no ha conectado Stripe (400)', async () => {
    const inv = await issueInvoice();
    await request(app.getHttpServer())
      .post('/api/payments/checkout')
      .set(auth())
      .send({ invoiceId: inv.id })
      .expect(400);
  });

  it('el onboarding conecta la cuenta y guarda stripeAccountId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/connect/onboard')
      .set(auth())
      .expect(201);
    expect(res.body.url).toContain('stripe.test');
    const status = await request(app.getHttpServer())
      .get('/api/payments/connect/status')
      .set(auth())
      .expect(200);
    expect(status.body.connected).toBe(true);
  });

  it('con la cuenta conectada, el checkout devuelve un enlace de pago', async () => {
    const inv = await issueInvoice();
    const res = await request(app.getHttpServer())
      .post('/api/payments/checkout')
      .set(auth())
      .send({ invoiceId: inv.id })
      .expect(201);
    expect(res.body.url).toContain('stripe.test/checkout');
  });

  it('el webhook checkout.session.completed marca la factura PAID y registra el cobro', async () => {
    const inv = await issueInvoice();
    await request(app.getHttpServer())
      .post('/api/payments/webhook/stripe')
      .set({ 'stripe-signature': 'test_sig' })
      .send(sessionEvent(inv.id, inv.total * 100, { pi: 'pi_paid_1' }))
      .expect(201);

    const got = await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${inv.id}`)
      .set(auth())
      .expect(200);
    expect(got.body.status).toBe('PAID');
    expect(Number(got.body.amountPaid)).toBe(inv.total);

    const payments = await request(app.getHttpServer())
      .get(`/api/payments/by-invoice/${inv.id}`)
      .set(auth())
      .expect(200);
    expect(payments.body.length).toBe(1);
    expect(payments.body[0].method).toBe('STRIPE');
    expect(payments.body[0].providerRef).toBe('pi_paid_1');
  });

  it('el webhook es idempotente: reenviar el mismo evento no duplica el cobro', async () => {
    const inv = await issueInvoice();
    const evt = sessionEvent(inv.id, inv.total * 100, { pi: 'pi_dedup_1' });
    await request(app.getHttpServer())
      .post('/api/payments/webhook/stripe')
      .set({ 'stripe-signature': 'test_sig' })
      .send(evt)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/payments/webhook/stripe')
      .set({ 'stripe-signature': 'test_sig' })
      .send(evt)
      .expect(201);

    const payments = await request(app.getHttpServer())
      .get(`/api/payments/by-invoice/${inv.id}`)
      .set(auth())
      .expect(200);
    expect(payments.body.length).toBe(1);
  });

  it('un evento de tipo no manejado se acepta sin efectos', async () => {
    const inv = await issueInvoice();
    await request(app.getHttpServer())
      .post('/api/payments/webhook/stripe')
      .set({ 'stripe-signature': 'test_sig' })
      .send(sessionEvent(inv.id, inv.total * 100, { type: 'payment_intent.created' }))
      .expect(201);
    const payments = await request(app.getHttpServer())
      .get(`/api/payments/by-invoice/${inv.id}`)
      .set(auth())
      .expect(200);
    expect(payments.body.length).toBe(0);
  });
});
