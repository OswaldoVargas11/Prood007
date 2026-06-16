import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

/**
 * E2E del cambio de contraseña self-service. Tenant propio para no perturbar otras suites.
 * Cubre: re-autenticación, política de longitud, "igual que la actual", rotación de credencial y
 * cierre del resto de sesiones (los refresh previos quedan revocados). Requiere Postgres migrado.
 */
describe('Change password (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const email = `cp_admin_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  const newPassword = 'N3wSecret!2026#';
  let tenantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho CP',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin CP' },
      })
      .expect(201);
    tenantId = res.body.tenantId;
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

  it('sin token → 401', async () => {
    await request(server())
      .post('/api/auth/change-password')
      .send({ currentPassword: password, newPassword })
      .expect(401);
  });

  it('contraseña actual incorrecta → 401 currentPasswordInvalid', async () => {
    const { accessToken } = await login(password);
    const res = await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'incorrecta', newPassword })
      .expect(401);
    expect(res.body.messageKey).toBe('auth.currentPasswordInvalid');
  });

  it('nueva contraseña demasiado corta → 400 validation.failed', async () => {
    const { accessToken } = await login(password);
    const res = await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword: 'corta' })
      .expect(400);
    expect(res.body.messageKey).toBe('validation.failed');
  });

  it('nueva igual que la actual → 400 passwordSameAsOld', async () => {
    const { accessToken } = await login(password);
    const res = await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword: password })
      .expect(400);
    expect(res.body.messageKey).toBe('auth.passwordSameAsOld');
  });

  it('cambio correcto: rota credencial, cierra el resto de sesiones y emite par nuevo', async () => {
    // Sesión A (la que cambia la clave) y sesión B (otro dispositivo, debe quedar cerrada).
    const sessionA = await login(password);
    const sessionB = await login(password);

    const res = await request(server())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    // La sesión B (otro dispositivo) queda revocada: su refresh ya no rota.
    await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionB.refreshToken })
      .expect(401);

    // El refresh de A previo al cambio también quedó revocado (se emitió uno nuevo).
    await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: sessionA.refreshToken })
      .expect(401);

    // El par nuevo devuelto SÍ es válido.
    await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: res.body.refreshToken })
      .expect(200);
  });

  it('tras el cambio: la contraseña antigua falla y la nueva funciona', async () => {
    await request(server()).post('/api/auth/login').send({ email, password }).expect(401);
    await request(server())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });
});
