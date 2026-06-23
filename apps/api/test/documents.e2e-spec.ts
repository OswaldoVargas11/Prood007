import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';

// Fuerza almacenamiento en disco local para el test (MinIO no es necesario).
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-storage-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Documents & review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantAId = '';
  let adminToken = '';
  let lawyerToken = '';
  let matterId = '';
  let documentId = '';
  let versionId = '';

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
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`docadmin_${unique}@d.test`);
    tenantAId = a.tenantId;
    adminToken = a.token;
    const b = await registerTenant(`docadminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    adminBToken = b.token;

    // Crear un abogado en el tenant A (autor de documentos) y loguearlo.
    const lawyerRole = await system.role.findFirstOrThrow({
      where: { tenantId: tenantAId, code: 'LAWYER' },
    });
    const lawyerEmail = `lawyer_${unique}@d.test`;
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

    // Cliente + expediente para colgar documentos.
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ name: 'Cliente Doc', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ title: 'Asunto Doc', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    for (const id of [tenantAId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('la abogada sube un documento (versión 1, PENDING)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('name', 'Contrato')
      .attach('file', Buffer.from('contenido del contrato v1'), 'contrato.txt')
      .expect(201);
    expect(res.body.version.version).toBe(1);
    expect(res.body.version.reviewStatus).toBe('PENDING');
    documentId = res.body.document.id;
    versionId = res.body.version.id;
  });

  it('descarga la versión y recupera el contenido', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/documents/versions/${versionId}/download`)
      .set(auth(lawyerToken))
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).toString()).toBe('contenido del contrato v1');
  });

  it('la subida RECHAZA contenido activo HTML/SVG (anti stored-XSS en origen)', async () => {
    // Defensa en la subida (assertUploadSafe): un HTML con <script> no debe ni almacenarse.
    await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('name', 'evil')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'evil.html',
        contentType: 'text/html',
      })
      .expect(400);
    // Un SVG (puede ejecutar script) disfrazado de imagen también se rechaza por sniff de contenido.
    await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('name', 'svg')
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
        {
          filename: 'evil.png',
          contentType: 'image/png',
        },
      )
      .expect(400);
  });

  it('la descarga fuerza attachment para tipos no-inline (defensa en profundidad)', async () => {
    const up = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('name', 'datos')
      .attach('file', Buffer.from('col1,col2\n1,2\n'), {
        filename: 'datos.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/documents/versions/${up.body.version.id}/download`)
      .set(auth(lawyerToken))
      .expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('AISLAMIENTO: el tenant B no ve el documento del tenant A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set(auth(adminBToken))
      .expect(404);
  });

  it('el admin aprueba la versión y queda APPROVED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/documents/versions/${versionId}/review`)
      .set(auth(adminToken))
      .send({ status: 'APPROVED', comment: 'Conforme' })
      .expect(201);
    const v = res.body.versions.find((x: { id: string }) => x.id === versionId);
    expect(v.reviewStatus).toBe('APPROVED');
  });

  it('la abogada (autora) recibe una notificación de la revisión', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(auth(lawyerToken))
      .expect(200);
    const types = res.body.map((n: { type: string }) => n.type);
    expect(types).toContain('document.review');
  });

  it('rechaza revisar con estado PENDING (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/documents/versions/${versionId}/review`)
      .set(auth(adminToken))
      .send({ status: 'PENDING' })
      .expect(400);
  });

  it('añade una segunda versión (PENDING) al documento', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/versions`)
      .set(auth(lawyerToken))
      .attach('file', Buffer.from('contenido v2 corregido'), 'contrato-v2.txt')
      .expect(201);
    expect(res.body.version).toBe(2);
    expect(res.body.reviewStatus).toBe('PENDING');
  });
});
