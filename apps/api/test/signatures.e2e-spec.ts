import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';

// Almacenamiento local (sin MinIO) + secreto del webhook de firma para la verificación HMAC.
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-sign-${Date.now()}`);
process.env.SIGNATURE_WEBHOOK_SECRET = 'whsec_e2e_test';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Signatures / firma electrónica (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  const SECRET = 'whsec_e2e_test';

  let tenantAId = '';
  let adminToken = '';
  let lawyerToken = '';
  let matterId = '';
  let documentId = '';
  let versionId = '';
  let signatureId = '';
  let externalId = '';

  // Segundo tenant para aislamiento.
  let tenantBId = '';
  let adminBToken = '';

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
    return { tenantId: res.body.tenantId as string, token: res.body.tokens.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`signadmin_${unique}@d.test`);
    tenantAId = a.tenantId;
    adminToken = a.token;
    const b = await registerTenant(`signadminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    adminBToken = b.token;

    // Abogada en el tenant A (solicitante de la firma).
    const lawyerRole = await system.role.findFirstOrThrow({
      where: { tenantId: tenantAId, code: 'LAWYER' },
    });
    const lawyerEmail = `signlawyer_${unique}@d.test`;
    await system.user.create({
      data: {
        tenantId: tenantAId,
        email: lawyerEmail,
        passwordHash: await argon2.hash(password),
        fullName: 'Abogada',
        roles: { create: [{ roleId: lawyerRole.id }] },
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password, tenantId: tenantAId })
      .expect(200);
    lawyerToken = login.body.accessToken;

    // Cliente + expediente + documento (versión 1) sobre el que pedir firma.
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Cliente Firma', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(adminToken))
      .send({ title: 'Asunto Firma', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;

    const doc = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('name', 'Hoja de encargo')
      .attach('file', Buffer.from('contenido a firmar'), 'encargo.txt')
      .expect(201);
    documentId = doc.body.document.id;
    versionId = doc.body.version.id;
  });

  afterAll(async () => {
    for (const id of [tenantAId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('hex');

  it('la abogada solicita la firma (adaptador STUBBED → PENDING) con externalId de Signaturit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/signatures')
      .set(auth(lawyerToken))
      .send({ versionId, signerName: 'Ana Cliente', signerEmail: 'ana@cliente.test' })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.provider).toBe('signaturit');
    expect(res.body.externalId).toMatch(/^SIGNATURIT-/);
    // En modo STUBBED el signUrl fabricado NO se persiste (evita enviar al cliente un enlace 404).
    expect(res.body.signUrl).toBeNull();
    signatureId = res.body.id;
    externalId = res.body.externalId;
  });

  it('lista las firmas por documento y por expediente', async () => {
    const byDoc = await request(app.getHttpServer())
      .get(`/api/signatures/by-document/${documentId}`)
      .set(auth(lawyerToken))
      .expect(200);
    expect(byDoc.body).toHaveLength(1);
    expect(byDoc.body[0].id).toBe(signatureId);

    const byMatter = await request(app.getHttpServer())
      .get(`/api/signatures/by-matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(byMatter.body.map((s: { id: string }) => s.id)).toContain(signatureId);
  });

  it('AISLAMIENTO: el tenant B no puede pedir firma sobre la versión de A (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/signatures')
      .set(auth(adminBToken))
      .send({ versionId, signerName: 'X', signerEmail: 'x@x.test' })
      .expect(404);
  });

  it('AISLAMIENTO: el tenant B no ve las firmas del documento de A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/signatures/by-document/${documentId}`)
      .set(auth(adminBToken))
      .expect(404);
  });

  it('rechaza el webhook con firma HMAC inválida (400)', async () => {
    const body = JSON.stringify({ externalId, tenantId: tenantAId, status: 'SIGNED' });
    await request(app.getHttpServer())
      .post('/api/signatures/webhook/signaturit')
      .set('Content-Type', 'application/json')
      .set('x-signaturit-signature', 'firma-incorrecta')
      .send(body)
      .expect(400);
  });

  it('el webhook firmado (SIGNED) marca la solicitud como firmada y notifica al solicitante', async () => {
    const body = JSON.stringify({ externalId, tenantId: tenantAId, status: 'SIGNED' });
    await request(app.getHttpServer())
      .post('/api/signatures/webhook/signaturit')
      .set('Content-Type', 'application/json')
      .set('x-signaturit-signature', sign(body))
      .send(body)
      .expect(200);

    const byDoc = await request(app.getHttpServer())
      .get(`/api/signatures/by-document/${documentId}`)
      .set(auth(lawyerToken))
      .expect(200);
    expect(byDoc.body[0].status).toBe('SIGNED');
    expect(byDoc.body[0].completedAt).toBeTruthy();

    const notifs = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(auth(lawyerToken))
      .expect(200);
    expect(notifs.body.map((n: { type: string }) => n.type)).toContain('signature.signed');
  });

  it('no permite cancelar una solicitud ya firmada (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/signatures/${signatureId}/cancel`)
      .set(auth(adminToken))
      .expect(400);
  });

  it('cancela una solicitud pendiente y queda CANCELED', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/signatures')
      .set(auth(lawyerToken))
      .send({ versionId, signerName: 'Otro Firmante', signerEmail: 'otro@cliente.test' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/signatures/${created.body.id}/cancel`)
      .set(auth(adminToken))
      .expect(201);
    expect(res.body.status).toBe('CANCELED');
    expect(res.body.completedAt).toBeTruthy();
  });
});
