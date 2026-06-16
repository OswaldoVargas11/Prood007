import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Retainer · PR-R2: motor de saldo + tipos no fiscales + lecturas. Foco de revisión: el INVARIANTE
 * (balance == Σ movimientos) y la CONCURRENCIA (SELECT … FOR UPDATE serializa depósitos concurrentes
 * sin perder updates). Además: ANTICIPO bloqueado, guard de moneda, role-gating, aislamiento.
 */
describe('Retainer · cobro de provisión + saldo (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let tenantId = '';
  let clientId = '';
  let clientToken = '';
  let matterId = '';
  let concMatterId = '';
  let adminTokenB = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerTenant(suffix: string) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${suffix}_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `${suffix}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    return { token: reg.body.tokens.accessToken as string, tenantId: reg.body.tenantId as string };
  }

  async function createMatter(token: string, clientBodyId: string) {
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(token))
      .send({ title: 'Asunto', type: 'civil', clientId: clientBodyId })
      .expect(201);
    return matter.body.id as string;
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

    const main = await registerTenant('ret');
    adminToken = main.token;
    tenantId = main.tenantId;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente provisión', taxId: '12345678Z' })
      .expect(201);
    clientId = client.body.id;
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `retclient_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `retclient_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    matterId = await createMatter(adminToken, clientId);
    concMatterId = await createMatter(adminToken, clientId);

    const b = await registerTenant('retb');
    adminTokenB = b.token;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const deposit = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/retainer/deposit').set(bearer(token)).send(body);

  it('ANTICIPO bloqueado: un depósito de anticipo se rechaza (exige factura, R2b)', async () => {
    await deposit(adminToken, { matterId, amount: '500.00', kind: 'ANTICIPO' }).expect(400);
  });

  it('SUPLIDO suma al saldo y queda registrado con su tipo', async () => {
    const res = await deposit(adminToken, {
      matterId,
      amount: '100.00',
      kind: 'SUPLIDO',
      note: 'Tasas',
    }).expect(201);
    expect(res.body.balance).toBe('100.00');

    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(acc.body.balance).toBe('100.00');
    expect(acc.body.currency).toBe('EUR');
    expect(acc.body.entries).toHaveLength(1);
    expect(acc.body.entries[0]).toMatchObject({
      type: 'DEPOSIT',
      kind: 'SUPLIDO',
      amount: '100.00',
    });
  });

  it('GENERICO suma al saldo acumulado', async () => {
    const res = await deposit(adminToken, { matterId, amount: '50.00', kind: 'GENERICO' }).expect(
      201,
    );
    expect(res.body.balance).toBe('150.00');
  });

  it('guard de moneda: rechaza un depósito en moneda distinta a la del despacho (400)', async () => {
    await deposit(adminToken, {
      matterId,
      amount: '10.00',
      kind: 'SUPLIDO',
      currency: 'DOP',
    }).expect(400);
  });

  it('importe no positivo se rechaza (400)', async () => {
    await deposit(adminToken, { matterId, amount: '0', kind: 'SUPLIDO' }).expect(400);
  });

  it('role-gating: un usuario CLIENT no puede cobrar provisión (403)', async () => {
    await deposit(clientToken, { matterId, amount: '10.00', kind: 'SUPLIDO' }).expect(403);
  });

  it('AISLAMIENTO: el tenant B no accede al expediente del tenant A (400)', async () => {
    await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(bearer(adminTokenB))
      .expect(400);
  });

  it('CONCURRENCIA + INVARIANTE: 10 depósitos concurrentes no pierden updates; balance == Σ movimientos', async () => {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        deposit(adminToken, { matterId: concMatterId, amount: '10.00', kind: 'GENERICO' }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${concMatterId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(acc.body.balance).toBe('100.00'); // 10 × 10.00, sin updates perdidos
    expect(acc.body.entries).toHaveLength(N);

    // Invariante a nivel de BD: saldo cacheado == Σ(amount de los movimientos).
    const account = await system.retainerAccount.findFirstOrThrow({
      where: { matterId: concMatterId },
      include: { entries: true },
    });
    const sum = account.entries.reduce((s, e) => s + Number(e.amount), 0);
    expect(Number(account.balance)).toBeCloseTo(sum, 2);
    expect(Number(account.balance)).toBeCloseTo(100, 2);
  });
});
