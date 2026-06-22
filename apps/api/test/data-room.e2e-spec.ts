import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-dataroom-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Data room (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';
  let tenantBId = '';
  let tokenB = '';
  let roomId = '';
  let folderId = '';
  let docId = '';
  let magicToken = '';

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

    const a = await registerTenant(`dradmin_${unique}@d.test`);
    tenantId = a.tenantId;
    token = a.token;
    const b = await registerTenant(`dradminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    tokenB = b.token;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(token))
      .send({ name: 'Cliente DR', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(token))
      .send({ title: 'M&A', type: 'mercantil', clientId: client.body.id })
      .expect(201);

    const doc = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(token))
      .field('matterId', matter.body.id)
      .field('name', 'Contrato')
      .attach('file', Buffer.from('contenido confidencial'), 'contrato.txt')
      .expect(201);

    // Crea data room y vincula el documento.
    const room = await request(app.getHttpServer())
      .post('/api/data-rooms')
      .set(auth(token))
      .send({ matterId: matter.body.id, name: 'Due diligence' })
      .expect(201);
    roomId = room.body.id;

    const withFolder = await request(app.getHttpServer())
      .post(`/api/data-rooms/${roomId}/folders`)
      .set(auth(token))
      .send({ name: 'Legal' })
      .expect(201);
    folderId = withFolder.body.folders[0].id;

    const linked = await request(app.getHttpServer())
      .post(`/api/data-rooms/${roomId}/documents/link`)
      .set(auth(token))
      .send({ versionId: doc.body.version.id, folderId })
      .expect(201);
    docId = linked.body.documents[0].id;
  });

  afterAll(async () => {
    for (const id of [tenantId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  it('crea un enlace mágico (grant) y devuelve el token una vez', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/data-rooms/${roomId}/grants`)
      .set(auth(token))
      .send({ email: 'contraparte@external.test', expiresInDays: 7 })
      .expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.email).toBe('contraparte@external.test');
    magicToken = res.body.token;
  });

  it('EXTERNO: con el token ve la sala y el documento (sin sesión)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/data-rooms/external/${magicToken}`)
      .expect(200);
    expect(res.body.name).toBe('Due diligence');
    expect(res.body.viewer.email).toBe('contraparte@external.test');
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].id).toBe(docId);
  });

  it('EXTERNO: descarga el documento (queda registrado en el log)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/data-rooms/external/${magicToken}/documents/${docId}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).toString()).toBe('contenido confidencial');
  });

  it('EXTERNO: pregunta y el despacho responde; el externo ve la respuesta', async () => {
    await request(app.getHttpServer())
      .post(`/api/data-rooms/external/${magicToken}/questions`)
      .send({ body: '¿Hay cargas sobre el inmueble?' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/api/data-rooms/${roomId}/questions`)
      .set(auth(token))
      .expect(200);
    expect(list.body).toHaveLength(1);
    const qId = list.body[0].id;

    await request(app.getHttpServer())
      .post(`/api/data-rooms/questions/${qId}/answer`)
      .set(auth(token))
      .send({ answer: 'No, está libre de cargas.' })
      .expect(201);

    const ext = await request(app.getHttpServer())
      .get(`/api/data-rooms/external/${magicToken}/questions`)
      .expect(200);
    expect(ext.body.questions[0].answer).toBe('No, está libre de cargas.');
    expect(ext.body.questions[0].status).toBe('ANSWERED');
  });

  it('el log de accesos registra VIEW_ROOM, DOWNLOAD y QUESTION', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/data-rooms/${roomId}/access-log`)
      .set(auth(token))
      .expect(200);
    const actions = res.body.map((e: { action: string }) => e.action);
    expect(actions).toContain('VIEW_ROOM');
    expect(actions).toContain('DOWNLOAD');
    expect(actions).toContain('QUESTION');
  });

  it('AISLAMIENTO: el tenant B no ve el data room del tenant A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/data-rooms/${roomId}`)
      .set(auth(tokenB))
      .expect(404);
  });

  it('token inválido → 404', async () => {
    await request(app.getHttpServer()).get('/api/data-rooms/external/no-existe').expect(404);
  });

  it('al revocar el grant, el enlace deja de funcionar (404)', async () => {
    const room = await request(app.getHttpServer())
      .get(`/api/data-rooms/${roomId}`)
      .set(auth(token))
      .expect(200);
    const grantId = room.body.grants[0].id;
    await request(app.getHttpServer())
      .delete(`/api/data-rooms/grants/${grantId}`)
      .set(auth(token))
      .expect(200);
    await request(app.getHttpServer()).get(`/api/data-rooms/external/${magicToken}`).expect(404);
  });
});
