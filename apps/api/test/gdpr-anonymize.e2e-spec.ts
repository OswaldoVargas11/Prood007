import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RGPD / Ley 172-13 — derecho de supresión por ANONIMIZACIÓN (no hard-delete). La PII del titular se
 * sobrescribe y el portal se corta, pero el expediente, las facturas y el AuditLog se PRESERVAN
 * (retención legal). Ver D-022.
 */
describe('GDPR anonymize (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  const portalPassword = 'Cli3ntPass!2026';

  let adminToken = '';
  let lawyerToken = '';
  let otherToken = '';
  let clientId = '';
  const portalEmail = `portal_${unique}@ex.test`;
  const tenantIds: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerTenant(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${email}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
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
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`anon_${unique}@d.test`);
    adminToken = a.token;
    const other = await registerTenant(`anonb_${unique}@d.test`);
    otherToken = other.token;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({
        name: 'Titular Borrable',
        taxId: '12345678Z',
        email: 'borrable@ex.test',
        phone: '600',
      })
      .expect(201);
    clientId = client.body.id;
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(adminToken))
      .send({ title: 'Asunto a conservar', type: 'civil', clientId })
      .expect(201);
    // Una factura (debe PRESERVARSE tras anonimizar).
    await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(adminToken))
      .send({
        matterId: matter.body.id,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    // Acceso al portal (se debe cortar al anonimizar).
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/portal-user`)
      .set(auth(adminToken))
      .send({ email: portalEmail, password: portalPassword, fullName: 'Cliente Portal' })
      .expect(201);

    // Letrado no admin en el tenant A.
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

  it('el portal del cliente funciona ANTES de anonimizar', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: portalEmail, password: portalPassword })
      .expect(200);
  });

  it('un letrado (no admin) NO puede anonimizar (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/anonymize`)
      .set(auth(lawyerToken))
      .expect(403);
  });

  it('AISLAMIENTO: otro tenant no puede anonimizar el cliente ajeno (404)', async () => {
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/anonymize`)
      .set(auth(otherToken))
      .expect(404);
  });

  it('FIRM_ADMIN anonimiza: PII sobrescrita, expediente y facturas PRESERVADOS', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/anonymize`)
      .set(auth(adminToken))
      .expect(201);
    expect(res.body.anonymizedAt).toBeTruthy();
    expect(res.body.portalUserAnonymized).toBe(true);
    expect(res.body.preserved.matters).toBeGreaterThan(0);
    expect(res.body.preserved.invoices).toBeGreaterThan(0);

    // PII sobrescrita en la ficha.
    const client = await request(app.getHttpServer())
      .get(`/api/clients/${clientId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(client.body.name).toBe('[Titular anonimizado]');
    expect(client.body.email).toBeNull();
    expect(client.body.taxId).toMatch(/^ANON-/);
    expect(client.body.anonymizedAt).toBeTruthy();
  });

  it('el AuditLog conserva la traza de la anonimización (no se borra)', async () => {
    const logs = await system.auditLog.findMany({
      where: { entityId: clientId, action: 'client.anonymized' },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it('el portal del cliente queda CORTADO tras anonimizar (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: portalEmail, password: portalPassword })
      .expect(401);
  });

  it('no se puede re-anonimizar (409)', async () => {
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/anonymize`)
      .set(auth(adminToken))
      .expect(409);
  });
});
