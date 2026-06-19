import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * FACTURACIÓN MULTI-MONEDA + FORMATO ELEGIBLE. Un despacho (jurisdicción ES) puede emitir:
 *  - factura por defecto → EUR, formato es (Verifactu);
 *  - factura con override → USD + formato do (e-CF/ITBIS), DESACOPLADO de su jurisdicción.
 * Y la cartera vencida agrupa por moneda (sin mezclar EUR y USD en un total).
 */
describe('Multi-currency invoicing + selectable format (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let token = '';
  let matterId = '';

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
        tenantName: `Despacho multimoneda ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `mc_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    token = reg.body.tokens.accessToken;

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
      where: { name: { contains: `multimoneda ${unique}` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('por defecto emite en EUR con formato ES (Verifactu)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth())
      .send({
        matterId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    expect(res.body.invoice.currency).toBe('EUR');
    expect(res.body.invoice.invoiceFormat).toBe('es');
    expect(res.body.invoice.complianceFormat).toBe('VERIFACTU');
  });

  it('permite emitir en USD con formato RD (e-CF/ITBIS) aunque la jurisdicción sea ES', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth())
      .send({
        matterId,
        currency: 'USD',
        invoiceFormat: 'do',
        lines: [
          { description: 'Fees', quantity: '1', unitPrice: '200', taxCode: 'ITBIS_STANDARD' },
        ],
      })
      .expect(201);
    expect(res.body.invoice.currency).toBe('USD');
    expect(res.body.invoice.invoiceFormat).toBe('do');
    expect(res.body.invoice.complianceFormat).toBe('ECF');
  });

  it('el preview respeta el formato elegido (ITBIS bajo formato RD)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices/preview')
      .set(auth())
      .send({
        invoiceFormat: 'do',
        lines: [{ quantity: '1', unitPrice: '200', taxCode: 'ITBIS_STANDARD' }],
      })
      .expect(201);
    // 18% ITBIS sobre 200 = 36 de impuesto.
    expect(res.body.format).toBe('ECF');
    expect(Number(res.body.totals.taxAmount)).toBeCloseTo(36, 2);
  });

  it('la cartera vencida agrupa por moneda (EUR y USD por separado)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/aged-receivables')
      .set(auth())
      .expect(200);
    const currencies = res.body.byCurrency.map((g: { currency: string }) => g.currency).sort();
    expect(currencies).toEqual(['EUR', 'USD']);
  });
});
