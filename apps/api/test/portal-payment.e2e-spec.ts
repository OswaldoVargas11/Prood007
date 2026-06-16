import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { StripePaymentProvider } from '../src/payments/providers/stripe.provider';

/**
 * Pago de factura POR EL CLIENTE desde su portal (Stripe mockeado). El cobro con tarjeta es acción del
 * cliente, no del despacho: el cliente paga SU propia factura (control de propiedad), el cargo va a la
 * cuenta conectada del despacho. Cubre: config del portal, checkout propio, y rechazo de factura ajena.
 */
describe('Portal · pago por el cliente (e2e, Stripe mock)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let tenantId = '';
  let clientTokenA = '';
  let invIdA = '';
  let invIdB = '';

  const stripeStub = {
    jurisdiction: 'es',
    method: 'STRIPE',
    isOnlineEnabled: () => true,
    createCheckout: async () => ({ url: 'https://stripe.test/checkout', providerRef: 'cs_test_1' }),
    createAccountLink: async () => ({
      accountId: 'acct_test_1',
      url: 'https://stripe.test/onboard',
    }),
    accountStatus: async () => ({ chargesEnabled: true, detailsSubmitted: true }),
  };

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function clientWithInvoice(suffix: string): Promise<{ token: string; invoiceId: string }> {
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: `Cliente ${suffix}`, taxId: '12345678Z' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `pc_${suffix}_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `pc_${suffix}_${unique}@d.test`, password, tenantId })
      .expect(200);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId: matter.body.id,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    return { token: login.body.accessToken as string, invoiceId: inv.body.invoice.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StripePaymentProvider)
      .useValue(stripeStub)
      .compile();
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
        tenantName: `Despacho portalpay_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `portalpay_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    adminToken = reg.body.tokens.accessToken;
    tenantId = reg.body.tenantId;

    // El despacho conecta Stripe (deja stripeAccountId).
    await request(app.getHttpServer())
      .post('/api/payments/connect/onboard')
      .set(bearer(adminToken))
      .expect(201);

    const a = await clientWithInvoice('a');
    clientTokenA = a.token;
    invIdA = a.invoiceId;
    const b = await clientWithInvoice('b');
    invIdB = b.invoiceId;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('el portal del cliente reporta que el cobro online está disponible', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/portal/payments/config')
      .set(bearer(clientTokenA))
      .expect(200);
    expect(res.body.onlineEnabled).toBe(true);
  });

  it('el cliente paga SU propia factura: devuelve el enlace de Stripe Checkout', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/portal/invoices/${invIdA}/checkout`)
      .set(bearer(clientTokenA))
      .expect(201);
    expect(res.body.url).toContain('stripe.test/checkout');
  });

  it('el cliente NO puede pagar la factura de otro cliente (404)', async () => {
    await request(app.getHttpServer())
      .post(`/api/portal/invoices/${invIdB}/checkout`)
      .set(bearer(clientTokenA))
      .expect(404);
  });

  it('un usuario STAFF no puede usar los endpoints del portal (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/portal/payments/config')
      .set(bearer(adminToken))
      .expect(403);
  });
});
