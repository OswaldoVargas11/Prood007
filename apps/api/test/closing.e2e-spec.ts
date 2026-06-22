import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// Almacenamiento en disco local para el test (el binder lee documentos del storage).
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-closing-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Closing checklist + binder (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantAId = '';
  let adminToken = '';
  let matterId = '';
  let documentId = '';
  let checklistId = '';

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

    const a = await registerTenant(`cladmin_${unique}@d.test`);
    tenantAId = a.tenantId;
    adminToken = a.token;
    const b = await registerTenant(`cladminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    adminBToken = b.token;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Cliente Cierre', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(adminToken))
      .send({ title: 'Compraventa', type: 'mercantil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;

    const doc = await request(app.getHttpServer())
      .post('/api/documents')
      .set(auth(adminToken))
      .field('matterId', matterId)
      .field('name', 'SPA')
      .attach('file', Buffer.from('texto del contrato'), 'spa.txt')
      .expect(201);
    documentId = doc.body.document.id;
  });

  afterAll(async () => {
    for (const id of [tenantAId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  it('expone las plantillas integradas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/closing/templates')
      .set(auth(adminToken))
      .expect(200);
    const keys = res.body.map((t: { key: string }) => t.key);
    expect(keys).toContain('ma_share_purchase');
    expect(keys).toContain('blank');
  });

  it('crea un checklist desde plantilla e instancia sus partidas', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/closing')
      .set(auth(adminToken))
      .send({ matterId, title: 'Cierre M&A', templateKey: 'ma_share_purchase' })
      .expect(201);
    checklistId = res.body.id;
    expect(res.body.items.length).toBeGreaterThan(5);
    // Vienen ordenadas por categoría (condiciones previas primero).
    expect(res.body.items[0].category).toBe('CONDITION_PRECEDENT');
  });

  it('lista los checklists del expediente con progreso', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/closing/by-matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].total).toBeGreaterThan(5);
    expect(res.body[0].satisfied).toBe(0);
  });

  it('añade una partida, la marca cumplida y vincula un documento', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/closing/${checklistId}/items`)
      .set(auth(adminToken))
      .send({
        category: 'DELIVERABLE',
        title: 'Certificado de titularidad',
        responsibleParty: 'Vendedor',
      })
      .expect(201);
    const item = created.body.items.find(
      (i: { title: string }) => i.title === 'Certificado de titularidad',
    );
    expect(item).toBeTruthy();

    const updated = await request(app.getHttpServer())
      .patch(`/api/closing/items/${item.id}`)
      .set(auth(adminToken))
      .send({ status: 'SATISFIED', documentId })
      .expect(200);
    const after = updated.body.items.find((i: { id: string }) => i.id === item.id);
    expect(after.status).toBe('SATISFIED');
    expect(after.documentId).toBe(documentId);
  });

  it('genera el closing binder (ZIP) con el documento vinculado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/closing/${checklistId}/binder`)
      .set(auth(adminToken))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain('attachment');
    // Firma de un ZIP ("PK").
    const body = res.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });

  it('AISLAMIENTO: el tenant B no ve el checklist del tenant A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/closing/${checklistId}`)
      .set(auth(adminBToken))
      .expect(404);
  });

  it('AISLAMIENTO: el tenant B no puede crear un checklist en el expediente de A (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/closing')
      .set(auth(adminBToken))
      .send({ matterId, title: 'Intruso', templateKey: 'blank' })
      .expect(404);
  });
});
