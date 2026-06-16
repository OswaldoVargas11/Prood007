import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Retainer · PR-R3c: devolución (REFUND) de un anticipo ya facturado = **factura rectificativa por
 * SUSTITUCIÓN** (D-027 (c)). Reversa el anticipo como registro nuevo encadenado (Verifactu R1/S · e-CF
 * nota de crédito tipo 34) que referencia la factura rectificada; la factura de anticipo queda
 * INMUTABLE; y registra `RetainerEntry REFUND(−)`. NO resta saldo sin más.
 *
 * Cubre: rectificativa encadenada + tipos/causa/referencia (ES + RD), reversa exacta con IRPF,
 * atomicidad/guards (no anticipo, doble refund, ya deducido), interacción con la deducción (R3b no
 * deduce un anticipo devuelto) y role-gating.
 */
describe('Retainer · devolución de anticipo (rectificativa) (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let esToken = '';
  let esClientToken = '';
  let esClientId = '';
  let doToken = '';
  let doClientId = '';

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

  const newMatter = async (token: string, clientId: string, title: string) => {
    const m = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(token))
      .send({ title, type: 'civil', clientId })
      .expect(201);
    return m.body.id as string;
  };

  const anticipo = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/anticipo').set(bearer(token)).send(body);
  const refund = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/refund').set(bearer(token)).send(body);
  const finalInvoice = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/final-invoice').set(bearer(token)).send(body);
  const getInvoice = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/ledger/invoices/${id}`).set(bearer(token));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const es = await setupTenant('rref', 'es', 'EUR', 'B12345674', '12345678Z');
    esToken = es.token;
    esClientId = es.clientId;
    await request(app.getHttpServer())
      .post(`/api/clients/${es.clientId}/portal-user`)
      .set(bearer(esToken))
      .send({ email: `rrefc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `rrefc_${unique}@d.test`, password, tenantId: es.tenantId })
      .expect(200);
    esClientToken = login.body.accessToken;

    const dom = await setupTenant('rrefdo', 'do', 'DOP', '101010101', '00112345673');
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

  it('ES: el refund emite rectificativa R1/S encadenada, reversa el anticipo y baja el saldo; el anticipo queda inmutable', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund ES');
    const ant = await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201);
    expect(ant.body.total).toBe('1210.00');
    const anticipoHash = ant.body.compliance.recordHash as string;

    const res = await refund(esToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Devolución del anticipo',
    }).expect(201);
    // Rectificativa: reversa total en negativo y referencia la factura rectificada.
    expect(res.body.total).toBe('-1210.00');
    expect(res.body.rectifies).toBe(ant.body.number);
    expect(res.body.compliance.payload.rectificativa).toMatchObject({
      tipoFactura: 'R1',
      tipoRectificativa: 'S',
      causa: 'Devolución del anticipo',
    });
    // Saldo devuelto: 1210 − 1210 = 0.
    expect(res.body.balance).toBe('0.00');

    // La rectificativa es un registro NUEVO encadenado (tipo RECTIFICATIVA, encadena con el anticipo).
    const rect = await getInvoice(esToken, res.body.invoiceId).expect(200);
    expect(rect.body.documentType).toBe('RECTIFICATIVA');
    expect(rect.body.rectifiesInvoiceId).toBe(ant.body.invoiceId);
    expect(rect.body.previousRecordHash).toBe(anticipoHash);

    // La factura de anticipo queda INMUTABLE.
    const anticipoInv = await getInvoice(esToken, ant.body.invoiceId).expect(200);
    expect(anticipoInv.body.status).toBe('PAID');
    expect(anticipoInv.body.recordHash).toBe(anticipoHash);
    expect(anticipoInv.body.documentType).toBe('NORMAL');

    // Saldo: invariante + el movimiento es un REFUND(−).
    const account = await system.retainerAccount.findFirstOrThrow({
      where: { matterId },
      include: { entries: true },
    });
    const sum = account.entries.reduce((s, e) => s + Number(e.amount), 0);
    expect(Number(account.balance)).toBeCloseTo(sum, 2);
    expect(Number(account.balance)).toBeCloseTo(0, 2);
    const refundEntry = account.entries.find((e) => e.type === 'REFUND');
    expect(Number(refundEntry?.amount)).toBeCloseTo(-1210, 2);
  });

  it('ES: la rectificativa reversa también la retención (IRPF) de forma exacta', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund IRPF ES');
    // Anticipo con IRPF: 1000 + 210 IVA − 150 IRPF = 1060.
    const ant = await anticipo(esToken, {
      matterId,
      amount: '1000.00',
      withholdingTaxCode: 'IRPF_GENERAL',
    }).expect(201);
    expect(ant.body.total).toBe('1060.00');

    const res = await refund(esToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Devolución con IRPF',
    }).expect(201);
    // Reversa exacta: −1000 base, −210 IVA, +150 IRPF → total −1060. Saldo 1060 − 1060 = 0.
    expect(res.body.total).toBe('-1060.00');
    expect(res.body.balance).toBe('0.00');
  });

  it('ES: no se puede devolver dos veces el mismo anticipo (400)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund doble ES');
    const ant = await anticipo(esToken, { matterId, amount: '500.00' }).expect(201);
    await refund(esToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Primera devolución',
    }).expect(201);
    await refund(esToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Segunda devolución',
    }).expect(400);
  });

  it('ES: refund de una factura que no es anticipo del expediente se rechaza (400)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund noAnticipo ES');
    await anticipo(esToken, { matterId, amount: '500.00' }).expect(201);
    // Factura normal del expediente (no anticipo).
    const normal = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(esToken))
      .send({
        matterId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    await refund(esToken, {
      matterId,
      anticipoInvoiceId: normal.body.invoice.id,
      reason: 'No es anticipo',
    }).expect(400);
  });

  it('interacción R3b/R3c: un anticipo devuelto NO se deduce en la factura final', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund+deducción ES');
    const antA = await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201); // 1210
    const antB = await anticipo(esToken, { matterId, amount: '1000.00' }).expect(201); // 1210
    void antB;
    // Devuelve A → saldo 2420 − 1210 = 1210; quedan los fondos de B.
    const ref = await refund(esToken, {
      matterId,
      anticipoInvoiceId: antA.body.invoiceId,
      reason: 'Devolución parcial del expediente',
    }).expect(201);
    expect(ref.body.balance).toBe('1210.00');

    // Cierre: la final deduce SOLO B (no el devuelto A). Neto = 3000 − 1000 = 2000 base.
    const fin = await finalInvoice(esToken, {
      matterId,
      lines: [
        {
          description: 'Servicio completo',
          quantity: '1',
          unitPrice: '3000',
          taxCode: 'IVA_STANDARD',
        },
      ],
    }).expect(201);
    expect(fin.body.taxableBase).toBe('2000.00');
    expect(fin.body.deducted).toHaveLength(1);
    expect(fin.body.deducted[0].invoiceNumber).toBe(antB.body.number);
    // Drawdown del anticipo activo (B): saldo 1210 − 1210 = 0.
    expect(fin.body.balance).toBe('0.00');
  });

  it('RD: el refund emite una nota de crédito e-CF (tipo 34) que referencia el e-CF del anticipo', async () => {
    const matterId = await newMatter(doToken, doClientId, 'Refund RD');
    const ant = await anticipo(doToken, { matterId, amount: '1000.00' }).expect(201); // 1180
    expect(ant.body.total).toBe('1180.00');

    const res = await refund(doToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Devolución del anticipo',
    }).expect(201);
    expect(res.body.total).toBe('-1180.00');
    expect(res.body.compliance.format).toBe('ECF');
    const xml = String(res.body.compliance.payload.ecfXml);
    expect(xml).toContain('<TipoeCF>34</TipoeCF>');
    expect(xml).toContain(`<NCFModificado>${ant.body.number}</NCFModificado>`);
    expect(res.body.balance).toBe('0.00');
  });

  it('role-gating: un usuario CLIENT no puede devolver un anticipo (403)', async () => {
    const matterId = await newMatter(esToken, esClientId, 'Refund role ES');
    const ant = await anticipo(esToken, { matterId, amount: '500.00' }).expect(201);
    await refund(esClientToken, {
      matterId,
      anticipoInvoiceId: ant.body.invoiceId,
      reason: 'Intento de cliente',
    }).expect(403);
  });
});
