import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-compare-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Document redline compare (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';
  let documentId = '';
  let v1 = '';
  let v2 = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho cmp ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `cmp_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(token))
      .send({ name: 'Cliente Cmp', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(token))
      .send({ title: 'Contrato', type: 'mercantil', clientId: client.body.id })
      .expect(201);

    const up = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(token))
      .field('matterId', matter.body.id)
      .field('name', 'Clausula')
      .attach('file', Buffer.from('el precio es mil euros pagaderos al contado'), {
        filename: 'v1.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    documentId = up.body.document.id;
    v1 = up.body.version.id;

    const up2 = await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/versions`)
      .set(auth(token))
      .attach('file', Buffer.from('el precio es dos mil euros pagaderos a plazos'), {
        filename: 'v2.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    v2 = up2.body.id;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  it('compara dos versiones de texto y devuelve segmentos con cambios', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/compare?base=${v1}&against=${v2}`)
      .set(auth(token))
      .expect(200);
    expect(res.body.extractable).toBe(true);
    expect(res.body.baseVersion).toBe(1);
    expect(res.body.againstVersion).toBe(2);
    expect(res.body.added).toBeGreaterThan(0);
    expect(res.body.removed).toBeGreaterThan(0);
    const types = res.body.segments.map((s: { type: string }) => s.type);
    expect(types).toContain('insert');
    expect(types).toContain('delete');
    expect(types).toContain('equal');
  });

  it('rechaza comparar una versión consigo misma (400)', async () => {
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/compare?base=${v1}&against=${v1}`)
      .set(auth(token))
      .expect(400);
  });

  it('404 si la versión no pertenece al documento/tenant', async () => {
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/compare?base=${v1}&against=nope`)
      .set(auth(token))
      .expect(404);
  });
});
