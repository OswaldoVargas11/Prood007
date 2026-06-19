import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * MURO DE FIN DE PRUEBA. Al expirar la prueba sin suscripción, la app queda bloqueada (402) salvo las
 * rutas @AllowExpired (estado/checkout/portal y sesión). Verifica:
 *   - prueba vigente  → endpoint protegido 200
 *   - prueba caducada → endpoint protegido 402, pero /subscription y /auth/me siguen 200
 *   - reactivada (ACTIVE) → vuelve a 200
 * De paso valida el payload de planes (ciclo anual con 2 meses gratis + cupo de Fundador).
 */
describe('Subscription wall on trial expiry (e2e)', () => {
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
        tenantName: `Despacho muro ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `wall_${unique}@d.test`, password, fullName: 'Admin Muro' },
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

  async function setTrial(opts: { status: string; trialEndsAt: Date | null }) {
    await system.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: opts.status, trialEndsAt: opts.trialEndsAt },
    });
  }

  it('con prueba VIGENTE, un endpoint protegido responde 200', async () => {
    await setTrial({ status: 'TRIALING', trialEndsAt: new Date(Date.now() + 7 * 86_400_000) });
    await request(app.getHttpServer()).get('/api/clients').set(auth(adminToken)).expect(200);
  });

  it('con prueba CADUCADA, el endpoint protegido responde 402 (muro)', async () => {
    await setTrial({ status: 'TRIALING', trialEndsAt: new Date(Date.now() - 86_400_000) });
    await request(app.getHttpServer()).get('/api/clients').set(auth(adminToken)).expect(402);
  });

  it('aun CADUCADA, /subscription y /auth/me siguen accesibles (@AllowExpired)', async () => {
    const sub = await request(app.getHttpServer())
      .get('/api/subscription')
      .set(auth(adminToken))
      .expect(200);
    expect(sub.body.hasAccess).toBe(false);
    // Anual = mensual × 10 (2 meses gratis) y cupo de Fundador disponible.
    expect(sub.body.annualFreeMonths).toBe(2);
    expect(sub.body.annualTotalEur).toBe(sub.body.monthlyTotalEur * 10);
    expect(sub.body.founderSlotsLeft).toBeGreaterThan(0);
    expect(sub.body.billingCycle).toBe('MONTHLY');

    await request(app.getHttpServer()).get('/api/auth/me').set(auth(adminToken)).expect(200);
  });

  it('reactivada (ACTIVE), el endpoint protegido vuelve a 200', async () => {
    await setTrial({ status: 'ACTIVE', trialEndsAt: null });
    await request(app.getHttpServer()).get('/api/clients').set(auth(adminToken)).expect(200);
  });
});
