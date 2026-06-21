import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * CANCELACIÓN DE SUSCRIPCIÓN AL FINAL DEL PERIODO (el admin la cancela desde la web).
 *
 * La llamada a Stripe (`POST /subscription/cancel|resume` → `subscriptions.update`) no es determinista
 * en CI (no hay STRIPE_SECRET_KEY), así que aquí fijamos el resultado que el webhook de Stripe deja en
 * el tenant y validamos el CONTRATO DE ESTADO del que depende la UI:
 *   - baja agendada (ACTIVE + cancelAtPeriodEnd) → se EXPONE el flag y se CONSERVA el acceso hasta la fecha
 *   - al expirar (CANCELED + flag limpio) → entra el muro (402) y `hasAccess=false`
 * Así el comportamiento que recorre un cliente al darse de baja queda blindado aunque el SDK de Stripe
 * no esté disponible en el pipeline.
 */
describe('Subscription cancel at period end (e2e)', () => {
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
        tenantName: `Despacho baja ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `cancel_${unique}@d.test`, password, fullName: 'Admin Baja' },
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

  it('por defecto, la suscripción no está marcada para cancelar', async () => {
    const sub = await request(app.getHttpServer())
      .get('/api/subscription')
      .set(auth(adminToken))
      .expect(200);
    expect(sub.body.cancelAtPeriodEnd).toBe(false);
  });

  it('baja agendada (ACTIVE + cancelAtPeriodEnd): expone el flag y CONSERVA el acceso', async () => {
    const periodEnd = new Date(Date.now() + 20 * 86_400_000);
    await system.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: null,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd,
      },
    });

    const sub = await request(app.getHttpServer())
      .get('/api/subscription')
      .set(auth(adminToken))
      .expect(200);
    expect(sub.body.status).toBe('ACTIVE');
    expect(sub.body.cancelAtPeriodEnd).toBe(true);
    expect(sub.body.hasAccess).toBe(true);
    expect(sub.body.currentPeriodEnd).not.toBeNull();

    // Durante la ventana de baja programada el despacho sigue operando con normalidad.
    await request(app.getHttpServer()).get('/api/clients').set(auth(adminToken)).expect(200);
  });

  it('al expirar (CANCELED + flag limpio): entra el muro y se pierde el acceso', async () => {
    // Lo que deja el webhook `customer.subscription.deleted`.
    await system.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: 'CANCELED', cancelAtPeriodEnd: false, currentPeriodEnd: null },
    });

    const sub = await request(app.getHttpServer())
      .get('/api/subscription')
      .set(auth(adminToken))
      .expect(200);
    expect(sub.body.status).toBe('CANCELED');
    expect(sub.body.cancelAtPeriodEnd).toBe(false);
    expect(sub.body.hasAccess).toBe(false);

    // Endpoint protegido bloqueado por el muro (402); /subscription sigue accesible (@AllowExpired).
    await request(app.getHttpServer()).get('/api/clients').set(auth(adminToken)).expect(402);
  });
});
