import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Retainer · PR-R2b: cobro de provisión ANTICIPO. Emite la factura de anticipo (Verifactu) y acredita
 * el retainer por el total recibido, TODO ATÓMICO. Foco de revisión: que no se salte `buildInvoiceRecord`
 * (registro fiscal real + serie + encadenamiento), la jurisdicción por provider, y que el conjunto
 * (factura PAID + Payment + ledger + saldo) quede consistente en una sola transacción.
 */
describe('Retainer · factura de anticipo (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientToken = '';
  let matterId = '';
  let noTaxToken = '';
  let noTaxMatterId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function setup(suffix: string, withTaxId: boolean) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${suffix}_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        ...(withTaxId ? { taxId: 'B12345674' } : {}),
        admin: { email: `${suffix}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    const token = reg.body.tokens.accessToken as string;
    const tenantId = reg.body.tenantId as string;
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
    return {
      token,
      tenantId,
      clientId: client.body.id as string,
      matterId: matter.body.id as string,
    };
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

    const main = await setup('rant', true);
    adminToken = main.token;
    matterId = main.matterId;
    await request(app.getHttpServer())
      .post(`/api/clients/${main.clientId}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `rantc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `rantc_${unique}@d.test`, password, tenantId: main.tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const noTax = await setup('rantnotax', false);
    noTaxToken = noTax.token;
    noTaxMatterId = noTax.matterId;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const anticipo = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/anticipo').set(bearer(token)).send(body);

  it('emite factura de anticipo ES (IVA 21% + IRPF 15%) y acredita el saldo por el total', async () => {
    const res = await anticipo(adminToken, {
      matterId,
      amount: '1000.00',
      withholdingTaxCode: 'IRPF_GENERAL',
    }).expect(201);
    // 1000 base + 210 IVA − 150 IRPF = 1060 total.
    expect(res.body.base).toBe('1000.00');
    expect(res.body.tax).toBe('210.00');
    expect(res.body.withholding).toBe('150.00');
    expect(res.body.total).toBe('1060.00');
    expect(res.body.balance).toBe('1060.00');
    expect(res.body.compliance.format).toBe('VERIFACTU');
    expect(res.body.compliance.recordHash).toMatch(/^[a-f0-9]{64}$/);

    // La factura de anticipo nace PAID y con registro fiscal.
    const inv = await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${res.body.invoiceId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(inv.body.status).toBe('PAID');
    expect(Number(inv.body.amountPaid)).toBe(1060);
    expect(inv.body.recordHash).toMatch(/^[a-f0-9]{64}$/);

    // El saldo del retainer del expediente refleja el total recibido.
    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(acc.body.balance).toBe('1060.00');
    expect(acc.body.entries[0]).toMatchObject({
      type: 'DEPOSIT',
      kind: 'ANTICIPO',
      amount: '1060.00',
    });
  });

  it('un segundo anticipo encadena con la huella del registro anterior (Verifactu)', async () => {
    const first = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(bearer(adminToken))
      .expect(200);
    void first;
    const res = await anticipo(adminToken, { matterId, amount: '500.00' }).expect(201);
    // Sin IRPF: 500 + 105 IVA = 605.
    expect(res.body.total).toBe('605.00');
    expect(res.body.compliance.payload.encadenamiento).toBeDefined();
    // Saldo acumulado: 1060 + 605 = 1665.
    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(acc.body.balance).toBe('1665.00');
  });

  it('ATOMICIDAD: si el despacho no tiene NIF, falla y NO deja factura ni movimiento huérfanos', async () => {
    await anticipo(noTaxToken, { matterId: noTaxMatterId, amount: '1000.00' }).expect(400);
    // Ninguna factura ni cuenta de retainer creada para ese expediente.
    const invoices = await request(app.getHttpServer())
      .get('/api/ledger/invoices')
      .set(bearer(noTaxToken))
      .expect(200);
    expect(invoices.body).toHaveLength(0);
    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${noTaxMatterId}`)
      .set(bearer(noTaxToken))
      .expect(200);
    expect(acc.body.balance).toBe('0.00');
    expect(acc.body.entries).toHaveLength(0);
  });

  it('role-gating: un usuario CLIENT no puede emitir anticipo (403)', async () => {
    await anticipo(clientToken, { matterId, amount: '100.00' }).expect(403);
  });
});
