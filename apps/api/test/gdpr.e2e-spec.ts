import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RGPD / Ley 172-13 — derecho de acceso y portabilidad (export de datos del titular). Solo FIRM_ADMIN;
 * acotado al tenant. Ver D-022.
 */
describe('GDPR export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let lawyerToken = '';
  let otherToken = '';
  let clientId = '';
  const tenantIds: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerTenant(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${email}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantIds.push(res.body.tenantId);
    return { tenantId: res.body.tenantId as string, token: res.body.tokens.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`gdpr_${unique}@d.test`);
    adminToken = a.token;
    const other = await registerTenant(`gdprb_${unique}@d.test`);
    otherToken = other.token;

    // Cliente + expediente + un apunte de ledger en el tenant A.
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Titular RGPD', taxId: '12345678Z', email: 'titular@ex.test' })
      .expect(201);
    clientId = client.body.id;
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(adminToken))
      .send({ title: 'Asunto RGPD', type: 'civil', clientId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/ledger/entries')
      .set(auth(adminToken))
      .send({
        matterId: matter.body.id,
        type: 'PROVISION',
        amount: '500.00',
        description: 'Provisión',
      })
      .expect(201);

    // Un letrado (no admin) en el tenant A.
    const lawyerRole = await system.role.findFirstOrThrow({
      where: { tenantId: a.tenantId, code: 'LAWYER' },
    });
    const lawyerEmail = `lawyer_${unique}@d.test`;
    await system.user.create({
      data: {
        tenantId: a.tenantId,
        email: lawyerEmail,
        passwordHash: await argon2.hash(password),
        fullName: 'Letrado',
        roles: { create: [{ roleId: lawyerRole.id }] },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password, tenantId: a.tenantId })
      .expect(200);
    lawyerToken = login.body.accessToken;
  });

  afterAll(async () => {
    for (const id of tenantIds)
      await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('FIRM_ADMIN exporta los datos del titular (perfil + expedientes + ledger)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}/gdpr-export`)
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.subject).toBe('client');
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.data.name).toBe('Titular RGPD');
    expect(res.body.data.taxId).toBe('12345678Z');
    expect(res.body.data.matters).toHaveLength(1);
    expect(res.body.data.matters[0].title).toBe('Asunto RGPD');
    expect(res.body.data.matters[0].ledgerEntries.length).toBeGreaterThan(0);
  });

  it('un letrado (no admin) NO puede exportar (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}/gdpr-export`)
      .set(auth(lawyerToken))
      .expect(403);
  });

  it('AISLAMIENTO: otro tenant no puede exportar el cliente ajeno (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/clients/${clientId}/gdpr-export`)
      .set(auth(otherToken))
      .expect(404);
  });
});
