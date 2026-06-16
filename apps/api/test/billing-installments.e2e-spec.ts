import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Facturación programada · PR-RP4(a): emisión de un plan de pago SERVICE_RENDERED. El servicio ya se
 * prestó → se emite UNA sola factura por el importe completo (IVA/ITBIS íntegro al emitir, sin doble
 * imposición) y las cuotas pasan a ser un calendario de COBRO ligado a esa factura (no son facturas
 * nuevas). Verifica: factura única con IVA completo, cuotas ligadas, idempotencia y guard de ADVANCE
 * (que va por RP4b, devengo al cobro).
 */
describe('Facturación programada · plan de pago (servicio prestado) (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let matterId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const create = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/billing/schedules').set(bearer(token)).send(body);
  const run = (token: string, id: string) =>
    request(app.getHttpServer()).post(`/api/billing/schedules/${id}/run`).set(bearer(token));
  const getSchedule = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/billing/schedules/${id}`).set(bearer(token));
  const getInvoice = (token: string, id: string) =>
    request(app.getHttpServer()).get(`/api/ledger/invoices/${id}`).set(bearer(token));

  const lines = [
    { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
  ];

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
        tenantName: `Despacho bins_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `bins_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    adminToken = reg.body.tokens.accessToken;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
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

  it('SERVICE_RENDERED: emite UNA factura con IVA completo y liga las cuotas como calendario de cobro', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'SERVICE_RENDERED',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-15',
      lines, // base 1000
    }).expect(201);

    const res = await run(adminToken, sch.body.id).expect(201);
    // Una sola emisión (no una factura por cuota).
    expect(res.body.emitted).toHaveLength(1);
    expect(res.body.completed).toBe(false);

    // La factura única: base 1000 + IVA 210 = 1210 (IVA completo al emitir; sin doble imposición).
    const inv = await getInvoice(adminToken, res.body.emitted[0].invoiceId).expect(200);
    expect(inv.body.documentType).toBe('NORMAL');
    expect(Number(inv.body.taxableBase)).toBe(1000);
    expect(Number(inv.body.taxAmount)).toBe(210);
    expect(Number(inv.body.total)).toBe(1210);

    // Las 3 cuotas quedan ligadas a esa factura (calendario de cobro), aún SCHEDULED.
    const after = await getSchedule(adminToken, sch.body.id).expect(200);
    expect(after.body.installments).toHaveLength(3);
    expect(
      after.body.installments.every(
        (i: { invoiceId: string }) => i.invoiceId === res.body.emitted[0].invoiceId,
      ),
    ).toBe(true);
    expect(after.body.installments.every((i: { status: string }) => i.status === 'SCHEDULED')).toBe(
      true,
    );
    // No hay más emisiones programadas: la factura del servicio es única.
    expect(after.body.nextRunAt).toBeNull();
    expect(after.body.status).toBe('ACTIVE');
  });

  it('idempotencia: correr de nuevo no emite otra factura', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'SERVICE_RENDERED',
      intervalUnit: 'MONTHLY',
      installmentCount: 2,
      startDate: '2026-01-15',
      lines,
    }).expect(201);
    await run(adminToken, sch.body.id).expect(201); // emite 1
    const again = await run(adminToken, sch.body.id).expect(201);
    expect(again.body.emitted).toHaveLength(0);
  });

  it('guard: un plan de pago por ANTICIPOS no se emite por esta vía (va al cobro, RP4b) (400)', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'ADVANCE',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-15',
      lines,
    }).expect(201);
    await run(adminToken, sch.body.id).expect(400);
  });
});
