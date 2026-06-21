import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Cableado del núcleo de IA en estado DESHABILITADO (lo que ocurre en CI/dev sin `ANTHROPIC_API_KEY` ni
 * `VOYAGE_API_KEY`). Verifica que:
 *   - `GET /ai/status` responde 200 con `enabled:false` (la UI muestra la IA apagada en vez de fallar).
 *   - la búsqueda semántica responde 503 `ai.searchDisabled` cuando no hay embeddings.
 * "Enchufar el agente" = definir la clave; entonces `enabled` pasa a true sin tocar más código.
 */
describe('AI core wiring — disabled without keys (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let adminToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho IA ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `ai_${unique}@d.test`, password, fullName: 'Admin IA' },
      })
      .expect(201);
    tenantId = res.body.tenantId;
    adminToken = res.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('GET /ai/status → 200 con enabled:false sin clave', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai/status')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.searchEnabled).toBe(false);
    expect(res.body.model).toBeNull();
  });

  it('POST /ai/search → 503 cuando los embeddings están deshabilitados', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai/search')
      .set(auth(adminToken))
      .send({ query: 'cláusula de confidencialidad' })
      .expect(503);
    expect(res.body.messageKey).toBe('ai.searchDisabled');
  });

  it('GET /ai/status exige autenticación (401 sin token)', async () => {
    await request(app.getHttpServer()).get('/api/ai/status').expect(401);
  });
});
