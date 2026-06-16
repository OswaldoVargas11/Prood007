import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Retainer · PR-R3b: factura FINAL de cierre con DEDUCCIÓN del anticipo (D-027 (b)). Se factura el
 * servicio completo y se neutralizan los anticipos ya facturados con líneas negativas: el IVA acumulado
 * (anticipo + final) = IVA del total, SIN doble imposición. NO es una rectificativa (los anticipos
 * quedan inmutables). Tras emitir, el anticipo se REALIZA con un APPLICATION(−) sin Payment.
 *
 * Cubre: deducción sin doble IVA + encadenamiento + trazabilidad (ES Verifactu / RD e-CF), atomicidad,
 * guards (sin anticipo, doble cierre, deducción > servicio) y role-gating.
 */
describe('Retainer · factura final con deducción del anticipo (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let esToken = '';
  let esClientToken = '';
  let doToken = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function setupTenant(
    suffix: string,
    jurisdiction: 'es' | 'do',
    currency: 'EUR' | 'DOP',
    tenantTaxId: string,
    clientTaxId: string,
  ) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${suffix}_${unique}@d.test`,
        jurisdiction,
        currency,
        taxId: tenantTaxId,
        admin: { email: `${suffix}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    const token = reg.body.tokens.accessToken as string;
    const tenantId = reg.body.tenantId as string;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(token))
      .send({ name: 'Cliente', taxId: clientTaxId })
      .expect(201);
    return { token, tenantId, clientId: client.body.id as string };
  }

  async function newMatter(token: string, clientId: string, title: string) {
    const m = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(token))
      .send({ title, type: 'civil', clientId })
      .expect(201);
    return m.body.id as string;
  }

  const anticipo = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/anticipo').set(bearer(token)).send(body);
  const finalInvoice = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/final-invoice').set(bearer(token)).send(body);
  const getInvoice = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/ledger/invoices/${id}`).set(bearer(token));

  let esClientId = '';
  let doClientId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const es = await setupTenant('rded', 'es', 'EUR', 'B12345674', '12345678Z');
    esToken = es.token;
    esClientId = es.clientId;
    await request(app.getHttpServer())
      .post(`/api/clients/${es.clientId}/portal-user`)
      .set(bearer(esToken))
      .send({ email: `rdedc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `rdedc_${unique}@d.test`, password, tenantId: es.tenantId })
      .expect(200);
    esClientToken = login.body.accessToken;

    const dom = await setupTenant('rdeddo', 'do', 'DOP', '101010101', '00112345673');
    doToken = dom.token;
    doClientId = dom.clientId;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('ES: la final deduce el anticipo sin doble IVA, encadena, realiza el saldo y deja el anticipo inmutable', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Cierre ES');
    // Anticipo: base 1000 → 210 IVA → total 1210; saldo 1210.
    const ant = await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201);
    expect(ant.body.total).toBe('1210.00');
    const anticipoNumber = ant.body.number as string;
    const anticipoHash = ant.body.compliance.recordHash as string;

    // Factura final por el servicio completo (3000). Neto = 2000 base, 420 IVA, 2420 total.
    const res = await finalInvoice(esToken, {
      matterId,
      lines: [
        {
          description: 'Honorarios servicio completo',
          quantity: '1',
          unitPrice: '3000',
          taxCode: 'IVA_STANDARD',
        },
      ],
    }).expect(201);
    expect(res.body.taxableBase).toBe('2000.00');
    expect(res.body.taxAmount).toBe('420.00');
    expect(res.body.total).toBe('2420.00');
    // IVA acumulado = 210 (anticipo) + 420 (final) = 630 = IVA sobre los 3000 del servicio. Sin doble IVA.
    expect(210 + Number(res.body.taxAmount)).toBe(630);
    // Trazabilidad: el registro referencia la factura de anticipo deducida.
    expect(res.body.compliance.payload.anticiposDeducidos).toEqual([
      { numFactura: anticipoNumber, baseDeducida: '1000.00', impuesto: 'IVA_STANDARD' },
    ]);
    // El saldo del anticipo queda realizado (drawdown): 0.
    expect(res.body.balance).toBe('0.00');

    // La final nace ISSUED y encadena con la huella del anticipo.
    const finalInv = await getInvoice(esToken, res.body.invoiceId).expect(200);
    expect(finalInv.body.status).toBe('ISSUED');
    expect(finalInv.body.previousRecordHash).toBe(anticipoHash);

    // La factura de anticipo queda INMUTABLE: sigue PAID, mismo total y misma huella.
    const anticipoInv = await getInvoice(esToken, ant.body.invoiceId).expect(200);
    expect(anticipoInv.body.status).toBe('PAID');
    expect(Number(anticipoInv.body.total)).toBe(1210);
    expect(anticipoInv.body.recordHash).toBe(anticipoHash);

    // Invariante de saldo + el drawdown es una APPLICATION sin paymentId.
    const account = await system.retainerAccount.findFirstOrThrow({
      where: { matterId },
      include: { entries: true },
    });
    const sum = account.entries.reduce((s, e) => s + Number(e.amount), 0);
    expect(Number(account.balance)).toBeCloseTo(sum, 2);
    expect(Number(account.balance)).toBeCloseTo(0, 2);
    const drawdown = account.entries.find((e) => e.type === 'APPLICATION');
    expect(drawdown).toBeDefined();
    expect(drawdown?.paymentId).toBeNull();
    expect(Number(drawdown?.amount)).toBeCloseTo(-1210, 2);
  });

  it('ES: un segundo cierre del mismo expediente se rechaza (anticipo ya deducido, 400)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Cierre doble ES');
    await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201);
    await finalInvoice(esToken, {
      matterId,
      lines: [
        { description: 'Servicio', quantity: '1', unitPrice: '2000', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(201);
    // Segundo cierre: bloqueado.
    await finalInvoice(esToken, {
      matterId,
      lines: [
        { description: 'Servicio', quantity: '1', unitPrice: '2000', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(400);
  });

  it('ES: si la deducción supera la base del servicio (sería devolución) se rechaza (400)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Exceso ES');
    await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201);
    // Servicio 500 < anticipo 1000 → devolución (rectificativa, R3c), no deducción.
    await finalInvoice(esToken, {
      matterId,
      lines: [
        { description: 'Servicio', quantity: '1', unitPrice: '500', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(400);
  });

  it('ES: un expediente sin anticipos no admite factura final con deducción (400)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Sin anticipo ES');
    await request(app.getHttpServer())
      .post('/api/retainer/deposit')
      .set(bearer(esToken))
      .send({ matterId, amount: '500.00', kind: 'GENERICO' })
      .expect(201);
    await finalInvoice(esToken, {
      matterId,
      lines: [
        { description: 'Servicio', quantity: '1', unitPrice: '500', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(400);
  });

  it('RD: el e-CF final deduce el anticipo (ITBIS acumulado correcto) y lo referencia', async () => {
    const matterId = await newMatter(doToken, doClientId, 'Cierre RD');
    // Anticipo base 1000 → 180 ITBIS → total 1180.
    const ant = await anticipo(doToken, { matterId, amount: '1000.00' }).expect(201);
    expect(ant.body.total).toBe('1180.00');
    const anticipoNumber = ant.body.number as string;

    const res = await finalInvoice(doToken, {
      matterId,
      lines: [
        {
          description: 'Servicio completo',
          quantity: '1',
          unitPrice: '3000',
          taxCode: 'ITBIS_STANDARD',
        },
      ],
    }).expect(201);
    // Neto: 2000 base, 360 ITBIS, 2360 total. ITBIS acumulado = 180 + 360 = 540 = 18% de 3000.
    expect(res.body.taxableBase).toBe('2000.00');
    expect(res.body.taxAmount).toBe('360.00');
    expect(res.body.total).toBe('2360.00');
    expect(res.body.compliance.format).toBe('ECF');
    const xml = String(res.body.compliance.payload.ecfXml);
    expect(xml).toContain('<AnticiposDeducidos>');
    expect(xml).toContain(`<eNCFAnticipo>${anticipoNumber}</eNCFAnticipo>`);
    expect(xml).toContain('<MontoGravadoDeducido>1000.00</MontoGravadoDeducido>');
    expect(res.body.balance).toBe('0.00');
  });

  it('role-gating: un usuario CLIENT no puede emitir la factura final (403)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Role ES');
    await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201);
    await finalInvoice(esClientToken, {
      matterId,
      lines: [
        { description: 'Servicio', quantity: '1', unitPrice: '2000', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(403);
  });
});
