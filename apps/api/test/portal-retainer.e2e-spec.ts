import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Portal · PR-R5b: el cliente ve el SALDO de provisión de su expediente (solo lectura). Reutiliza
 * `RetainerService.getMatterAccount` acotado por `assertMatterAccess` (expediente propio). Verifica:
 * lectura del saldo propio, aislamiento (no ve el de otro cliente → 403) y role-gating (staff no entra
 * al portal).
 */
describe('Portal · saldo de provisión del cliente (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let clientAToken = '';
  let matterAId = '';
  let matterBId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function newClientWithMatter(suffix: string, tenantId: string, taxId: string) {
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: `Cliente ${suffix}`, taxId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `${suffix}_${unique}@d.test`, password, fullName: `Cliente ${suffix}` })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `${suffix}_${unique}@d.test`, password, tenantId })
      .expect(200);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: `Asunto ${suffix}`, type: 'civil', clientId: client.body.id })
      .expect(201);
    return { token: login.body.accessToken as string, matterId: matter.body.id as string };
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

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho pret_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `pret_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    adminToken = reg.body.tokens.accessToken;
    const tenantId = reg.body.tenantId as string;

    const a = await newClientWithMatter('preta', tenantId, '12345678Z');
    clientAToken = a.token;
    matterAId = a.matterId;
    const b = await newClientWithMatter('pretb', tenantId, 'X1234567L');
    matterBId = b.matterId;

    // Provisión GENERICO en el expediente de A (saldo 150).
    await request(app.getHttpServer())
      .post('/api/retainer/deposit')
      .set(bearer(adminToken))
      .send({ matterId: matterAId, amount: '150.00', kind: 'GENERICO' })
      .expect(201);
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const portalRetainer = (token: string, matterId: string) =>
    request(app.getHttpServer()).get(`/api/portal/matters/${matterId}/retainer`).set(bearer(token));

  it('el cliente ve el saldo + movimientos de la provisión de SU expediente', async () => {
    const res = await portalRetainer(clientAToken, matterAId).expect(200);
    expect(res.body.matterId).toBe(matterAId);
    expect(res.body.balance).toBe('150.00');
    expect(res.body.currency).toBe('EUR');
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries[0]).toMatchObject({ type: 'DEPOSIT', kind: 'GENERICO' });
  });

  it('AISLAMIENTO: el cliente NO ve la provisión del expediente de otro cliente (403)', async () => {
    await portalRetainer(clientAToken, matterBId).expect(403);
  });

  it('role-gating: el staff del despacho no accede al portal del cliente (403)', async () => {
    await portalRetainer(adminToken, matterAId).expect(403);
  });
});
