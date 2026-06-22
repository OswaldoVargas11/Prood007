import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Gating por tier (EntitlementsGuard). closing → Profesional+; integrations → Avanzado+.
 * Las suscripciones legacy/prueba (plan no-tier) tienen acceso completo (grandfathering).
 */
describe('Entitlements por tier (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const setPlan = (plan: string) =>
    system.tenant.update({ where: { id: tenantId }, data: { plan } });

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
        tenantName: `Despacho ent ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `ent_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const closing = () => request(app.getHttpServer()).get('/api/closing/templates').set(auth(token));
  const integrations = () =>
    request(app.getHttpServer()).get('/api/integrations/google/status').set(auth(token));

  it('plan por defecto (legacy "Profesional") → acceso completo (grandfathering)', async () => {
    await closing().expect(200);
    await integrations().expect(200);
  });

  it('ESENCIAL → closing e integraciones bloqueadas (403)', async () => {
    await setPlan('ESENCIAL');
    await closing().expect(403);
    await integrations().expect(403);
  });

  it('PROFESIONAL → closing OK; integraciones bloqueadas (403)', async () => {
    await setPlan('PROFESIONAL');
    await closing().expect(200);
    await integrations().expect(403);
  });

  it('AVANZADO → closing e integraciones OK', async () => {
    await setPlan('AVANZADO');
    await closing().expect(200);
    await integrations().expect(200);
  });

  it('FOUNDER → funciones de Profesional (closing OK, integraciones 403)', async () => {
    await setPlan('FOUNDER');
    await closing().expect(200);
    await integrations().expect(403);
  });

  it('/auth/me expone plan + entitlements', async () => {
    await setPlan('ESENCIAL');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set(auth(token)).expect(200);
    expect(me.body.tenant.plan).toBe('ESENCIAL');
    expect(me.body.tenant.entitlements.closing).toBe(false);
    expect(me.body.tenant.entitlements['data-room']).toBe(false);
  });
});
