import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-engagement-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Engagement letter (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';
  let tenantBId = '';
  let tokenB = '';
  let matterId = '';

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

    const a = await registerTenant(`eladmin_${unique}@d.test`);
    tenantId = a.tenantId;
    token = a.token;
    const b = await registerTenant(`eladminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    tokenB = b.token;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(token))
      .send({ name: 'Cliente EL', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(token))
      .send({ title: 'Asesoramiento', type: 'mercantil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    for (const id of [tenantId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  it('genera la hoja de encargo y crea el PDF en el expediente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/engagement-letters')
      .set(auth(token))
      .send({
        matterId,
        scope: 'Asesoramiento mercantil recurrente.',
        fees: '300 €/mes + IVA.',
        terms: 'Duración anual prorrogable.',
      })
      .expect(201);
    expect(res.body.status).toBe('GENERATED');
    expect(res.body.documentId).toBeTruthy();

    // El PDF aparece como documento del expediente.
    const docs = await request(app.getHttpServer())
      .get(`/api/documents/by-matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    expect(docs.body.some((d: { name: string }) => d.name === 'Hoja de encargo')).toBe(true);
  });

  it('lee la hoja de encargo del expediente', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/engagement-letters/by-matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    expect(res.body.fees).toContain('300');
  });

  it('regenera (upsert) al volver a guardar y mantiene una sola hoja por expediente', async () => {
    await request(app.getHttpServer())
      .post('/api/engagement-letters')
      .set(auth(token))
      .send({
        matterId,
        scope: 'Alcance revisado.',
        fees: '350 €/mes + IVA.',
        terms: 'Términos v2.',
      })
      .expect(201);
    const count = await system.engagementLetter.count({ where: { matterId } });
    expect(count).toBe(1);
  });

  it('AISLAMIENTO: el tenant B no puede crear la hoja en el expediente de A (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/engagement-letters')
      .set(auth(tokenB))
      .send({ matterId, scope: 'x', fees: 'y', terms: 'z' })
      .expect(404);
  });
});
