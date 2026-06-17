import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

/**
 * E2E del endurecimiento SEC4: corte duro de sesión por cambio de clave + auditoría de login,
 * lockout por cuenta y que los flujos NO se rompen con HIBP desactivado (defecto en tests).
 * Tenant propio para no perturbar otras suites. Requiere Postgres migrado.
 */
describe('SEC4 hardening (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const email = `sec4_admin_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  const newPassword = 'N3wSecret!2026#';
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    // El rate-limiting del login ya se prueba en security.e2e-spec; aquí lo desactivamos para poder
    // hacer varios logins seguidos sin chocar con el throttler (10/min) en una sola suite.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    // HIBP debe estar desactivado por defecto en tests: el registro con clave fuerte no debe fallar.
    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho SEC4',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin SEC4' },
      })
      .expect(201);
    tenantId = res.body.tenantId;
    const u = await system.user.findFirstOrThrow({ where: { tenantId, email } });
    userId = u.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  const server = () => app.getHttpServer();
  const login = async (pw: string) =>
    (await request(server()).post('/api/auth/login').send({ email, password: pw }).expect(200))
      .body as { accessToken: string; refreshToken: string };

  // Helpers de estado en BD (vía cliente de sistema, como hacen otras suites).
  const resetLockState = () =>
    system.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

  it('HIBP desactivado: el login con la clave del registro funciona (200) y /me responde', async () => {
    const { accessToken } = await login(password);
    const me = await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.userId).toBe(userId);
    // El admin del registro NO arrastra obligación de cambio.
    expect(me.body.mustChangePassword).toBe(false);
  });

  it('login correcto y fallido de usuario conocido quedan auditados', async () => {
    await resetLockState();
    const before = await system.auditLog.count({ where: { tenantId } });

    await request(server()).post('/api/auth/login').send({ email, password }).expect(200);
    await request(server())
      .post('/api/auth/login')
      .send({ email, password: 'incorrecta-xxx' })
      .expect(401);

    const success = await system.auditLog.count({
      where: { tenantId, action: 'auth.login_success' },
    });
    const failed = await system.auditLog.count({
      where: { tenantId, action: 'auth.login_failed' },
    });
    expect(success).toBeGreaterThanOrEqual(1);
    expect(failed).toBeGreaterThanOrEqual(1);
    const after = await system.auditLog.count({ where: { tenantId } });
    expect(after).toBeGreaterThan(before);
    await resetLockState();
  });

  it('email inexistente NO crea AuditLog y responde 401', async () => {
    const ghost = `no_existe_${unique}@nadie.test`;
    const before = await system.auditLog.count({});
    await request(server())
      .post('/api/auth/login')
      .send({ email: ghost, password: 'loquesea' })
      .expect(401);
    const after = await system.auditLog.count({});
    expect(after).toBe(before);
  });

  it('alta de staff: mustChangePassword=true y se expone en /me', async () => {
    await resetLockState();
    const { accessToken } = await login(password);
    const staffEmail = `sec4_staff_${unique}@despacho.test`;
    const staffPw = 'StaffSecret!2026';

    await request(server())
      .post('/api/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: staffEmail, fullName: 'Letrado SEC4', password: staffPw, role: 'LAWYER' })
      .expect(201);

    const staffLogin = (
      await request(server())
        .post('/api/auth/login')
        .send({ email: staffEmail, password: staffPw })
        .expect(200)
    ).body as { accessToken: string };

    const me = await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${staffLogin.accessToken}`)
      .expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    await resetLockState();
  });

  it('corte duro: un access token previo al cambio de clave → 401 (token viejo)', async () => {
    await resetLockState();
    // Token "viejo": emitido ANTES del cambio de contraseña.
    const stale = await login(password);

    // Cambiamos la clave (sella passwordChangedAt al instante).
    await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${stale.accessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    // El access token previo ya no vale, sin esperar a su expiración natural.
    const res = await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stale.accessToken}`)
      .expect(401);
    expect(res.body.messageKey).toBe('auth.tokenStale');

    // Dejamos la clave del usuario como estaba para los siguientes tests de lockout.
    const after = await login(newPassword);
    await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${after.accessToken}`)
      .send({ currentPassword: newPassword, newPassword: password })
      .expect(200);
    await resetLockState();
  });

  it('lockout: el 5º fallo bloquea la cuenta; con clave correcta sigue 401 hasta expirar', async () => {
    // El login está limitado (throttler 10/min): sembramos 4 fallos previos en BD y disparamos el 5º
    // por HTTP. Así verificamos el umbral real (MAX_FAILED_ATTEMPTS = 5) con una sola petición.
    await system.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 4, lockedUntil: null },
    });

    // 5º fallo consecutivo → fija el bloqueo (y reinicia el contador a 0).
    await request(server())
      .post('/api/auth/login')
      .send({ email, password: 'mala-clave' })
      .expect(401);

    const u = await system.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.lockedUntil).not.toBeNull();
    expect(u.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(u.failedLoginAttempts).toBe(0);

    // Ya bloqueada: incluso con la clave correcta → 401 accountLocked.
    const locked = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(401);
    expect(locked.body.messageKey).toBe('auth.accountLocked');

    // Simulamos la expiración del bloqueo (no esperamos 15 min reales) y comprobamos que entra.
    await resetLockState();
    await request(server()).post('/api/auth/login').send({ email, password }).expect(200);

    // Tras un login correcto, el contador queda a 0 y sin bloqueo.
    const ok = await system.user.findUniqueOrThrow({ where: { id: userId } });
    expect(ok.failedLoginAttempts).toBe(0);
    expect(ok.lockedUntil).toBeNull();
  });
});
