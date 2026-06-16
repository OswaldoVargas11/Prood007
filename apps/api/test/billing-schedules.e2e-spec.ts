import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Facturación programada · PR-RP2: crear/leer planes (RECURRING | INSTALLMENTS) + generación del cuadro
 * de cuotas. Verifica la generación (secuencias, fechas por cadencia, reparto con redondeo en la última),
 * las reglas por tipo, las lecturas, el role-gating y el aislamiento. La emisión es RP3/RP4.
 */
describe('Facturación programada · crear/leer planes (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientToken = '';
  let matterId = '';
  let otherAdminToken = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const create = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/billing/schedules').set(bearer(token)).send(body);

  const recLines = [
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
        tenantName: `Despacho bill_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `bill_${unique}@d.test`, password, fullName: 'Admin' },
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
      .send({ email: `billc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `billc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;

    const other = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho billx_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `billx_${unique}@d.test`, password, fullName: 'Otro' },
      })
      .expect(201);
    otherAdminToken = other.body.tokens.accessToken;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('RECURRING acotado: genera una cuota por periodo con la cadencia mensual', async () => {
    const res = await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      occurrences: 3,
      startDate: '2026-01-15',
      lines: recLines,
    }).expect(201);
    expect(res.body.type).toBe('RECURRING');
    expect(res.body.installments).toHaveLength(3);
    expect(res.body.installments.map((i: { amount: string }) => i.amount)).toEqual([
      '100.00',
      '100.00',
      '100.00',
    ]);
    // Fechas por cadencia mensual desde el 15.
    expect(res.body.installments[0].dueDate).toContain('2026-01-15');
    expect(res.body.installments[1].dueDate).toContain('2026-02-15');
    expect(res.body.installments[2].dueDate).toContain('2026-03-15');
    expect(res.body.installments.every((i: { status: string }) => i.status === 'SCHEDULED')).toBe(
      true,
    );
  });

  it('RECURRING abierto (sin occurrences): genera solo la primera cuota', async () => {
    const res = await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      startDate: '2026-01-01',
      lines: recLines,
    }).expect(201);
    expect(res.body.occurrences).toBeNull();
    expect(res.body.installments).toHaveLength(1);
    expect(res.body.nextRunAt).toContain('2026-01-01');
  });

  it('INSTALLMENTS (servicio prestado): reparte la base; la última cuota absorbe el redondeo', async () => {
    const res = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'SERVICE_RENDERED',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-10',
      lines: recLines, // base 100
    }).expect(201);
    expect(res.body.fiscalMode).toBe('SERVICE_RENDERED');
    expect(res.body.installments.map((i: { amount: string }) => i.amount)).toEqual([
      '33.33',
      '33.33',
      '33.34',
    ]);
    // Σ cuotas == base.
    const sum = res.body.installments.reduce(
      (s: number, i: { amount: string }) => s + Number(i.amount),
      0,
    );
    expect(Number(sum.toFixed(2))).toBe(100);
  });

  it('INSTALLMENTS (anticipos): persiste fiscalMode ADVANCE', async () => {
    const res = await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      fiscalMode: 'ADVANCE',
      intervalUnit: 'MONTHLY',
      installmentCount: 2,
      startDate: '2026-02-01',
      lines: [
        { description: 'Honorarios', quantity: '1', unitPrice: '1000', taxCode: 'IVA_STANDARD' },
      ],
    }).expect(201);
    expect(res.body.fiscalMode).toBe('ADVANCE');
    expect(res.body.installments.map((i: { amount: string }) => i.amount)).toEqual([
      '500.00',
      '500.00',
    ]);
  });

  it('validación: RECURRING con installmentCount se rechaza (400)', async () => {
    await create(adminToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      installmentCount: 3,
      startDate: '2026-01-01',
      lines: recLines,
    }).expect(400);
  });

  it('validación: INSTALLMENTS sin installmentCount se rechaza (400)', async () => {
    await create(adminToken, {
      matterId,
      type: 'INSTALLMENTS',
      intervalUnit: 'MONTHLY',
      startDate: '2026-01-01',
      lines: recLines,
    }).expect(400);
  });

  it('lecturas: lista por expediente y detalle con cuotas', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/billing/schedules?matterId=${matterId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThanOrEqual(4);
    const detail = await request(app.getHttpServer())
      .get(`/api/billing/schedules/${list.body[0].id}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(detail.body.installments.length).toBeGreaterThan(0);
  });

  it('role-gating: un usuario CLIENT no puede crear un plan (403)', async () => {
    await create(clientToken, {
      matterId,
      type: 'RECURRING',
      intervalUnit: 'MONTHLY',
      startDate: '2026-01-01',
      lines: recLines,
    }).expect(403);
  });

  it('AISLAMIENTO: el admin de otro despacho no ve el expediente ni sus planes', async () => {
    await request(app.getHttpServer())
      .get(`/api/billing/schedules?matterId=${matterId}`)
      .set(bearer(otherAdminToken))
      .expect(400); // matters.notInFirm
  });
});
