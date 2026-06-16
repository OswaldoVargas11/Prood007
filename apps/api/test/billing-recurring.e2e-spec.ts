import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Facturación programada · PR-RP3: emisión RECURRENTE. Por cada periodo vencido se emite 1 factura vía el
 * núcleo fiscal (`emitInvoiceInTx`: serie + Verifactu/e-CF + QR + encadenamiento). Verifica: emisión por
 * periodo, ENCADENAMIENTO de las facturas, cierre del plan acotado (COMPLETED), rolling del plan abierto
 * (genera la siguiente cuota), idempotencia (correr de nuevo no re-emite), guard de INSTALLMENTS y role.
 */
describe('Facturación programada · emisión recurrente (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientToken = '';
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
    { description: 'Iguala', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
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
        tenantName: `Despacho brec_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `brec_${unique}@d.test`, password, fullName: 'Admin' },
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
      .send({ email: `brecc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `brecc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

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

  it('RECURRING acotado: emite 1 factura por periodo vencido, encadenadas, y cierra el plan (COMPLETED)', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      occurrences: 3,
      startDate: '2026-01-15', // 3 periodos en el pasado respecto a "hoy"
      lines,
    }).expect(201);

    const res = await run(adminToken, sch.body.id).expect(201);
    expect(res.body.emitted).toHaveLength(3);
    expect(res.body.completed).toBe(true);

    // Cada factura del periodo: base 100 + IVA 21 = 121, documento NORMAL, con registro fiscal.
    const invoices = [];
    for (const e of res.body.emitted) {
      const inv = await getInvoice(adminToken, e.invoiceId).expect(200);
      expect(inv.body.documentType).toBe('NORMAL');
      expect(Number(inv.body.total)).toBe(121);
      expect(inv.body.recordHash).toMatch(/^[a-f0-9]{64}$/);
      invoices.push(inv.body);
    }
    // ENCADENAMIENTO Verifactu: cada factura encadena con la huella de la anterior (serie secuencial).
    expect(invoices[1].previousRecordHash).toBe(invoices[0].recordHash);
    expect(invoices[2].previousRecordHash).toBe(invoices[1].recordHash);

    // El plan queda cerrado: todas las cuotas EMITTED con su factura; nextRunAt null.
    const after = await getSchedule(adminToken, sch.body.id).expect(200);
    expect(after.body.status).toBe('COMPLETED');
    expect(after.body.nextRunAt).toBeNull();
    expect(after.body.installments.every((i: { status: string }) => i.status === 'EMITTED')).toBe(
      true,
    );
    expect(after.body.installments.every((i: { invoiceId: string }) => i.invoiceId)).toBe(true);

    // Correr de nuevo un plan COMPLETED se rechaza (no re-emite).
    await run(adminToken, sch.body.id).expect(400);
  });

  it('RECURRING abierto: hace catch-up de los periodos vencidos, deja la siguiente cuota a futuro y es idempotente', async () => {
    // Plan abierto desde un inicio en el pasado: el motor emite TODOS los periodos vencidos (catch-up) y
    // genera (rolling) la siguiente cuota, ya en el futuro respecto a "hoy".
    const sch = await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      startDate: '2026-01-01',
      lines,
    }).expect(201);

    const res = await run(adminToken, sch.body.id).expect(201);
    expect(res.body.emitted.length).toBeGreaterThanOrEqual(1);
    expect(res.body.completed).toBe(false);

    const after = await getSchedule(adminToken, sch.body.id).expect(200);
    expect(after.body.status).toBe('ACTIVE');
    // Queda EXACTAMENTE una cuota SCHEDULED (la siguiente), y su vencimiento es futuro; el resto EMITTED.
    const scheduled = after.body.installments.filter(
      (i: { status: string }) => i.status === 'SCHEDULED',
    );
    expect(scheduled).toHaveLength(1);
    expect(new Date(scheduled[0].dueDate).getTime()).toBeGreaterThan(Date.now());
    expect(
      after.body.installments
        .filter((i: { status: string }) => i.status === 'EMITTED')
        .every((i: { invoiceId: string }) => i.invoiceId),
    ).toBe(true);
    expect(new Date(after.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());

    // Idempotencia: la siguiente cuota vence en el futuro → correr de nuevo no emite nada.
    const again = await run(adminToken, sch.body.id).expect(201);
    expect(again.body.emitted).toHaveLength(0);
  });

  it('guard: un plan de pago (INSTALLMENTS) no se emite por esta vía todavía (400)', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'SERVICE_RENDERED',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-01',
      lines,
    }).expect(201);
    await run(adminToken, sch.body.id).expect(400);
  });

  it('role-gating: un usuario CLIENT no puede emitir (403)', async () => {
    const sch = await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      occurrences: 1,
      startDate: '2026-01-01',
      lines,
    }).expect(201);
    await run(clientToken, sch.body.id).expect(403);
  });
});
