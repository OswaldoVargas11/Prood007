import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

/**
 * E2E de recuperación de contraseña (SEC3): reset por admin + autoservicio "olvidé mi contraseña".
 * Cubre: emisión por admin, aplicación del token (un solo uso), cierre de sesiones, respuesta
 * genérica de forgot y rechazo de tokens inválidos/reutilizados. Requiere Postgres migrado.
 */
describe('Password reset (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const email = `reset_admin_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  const newPassword = 'Rec0vered!2026#';
  let tenantId: string;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Reset',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin Reset' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    adminToken = reg.body.tokens.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    adminUserId = me.body.userId;
  });

  afterAll(async () => {
    if (tenantId) {
      await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('reset por admin de un usuario inexistente → 404', async () => {
    await request(server())
      .post('/api/auth/admin/reset-password/noexiste')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('reset por admin sin rol admin → no autorizado', async () => {
    // Sin token → 401 (la ruta exige FIRM_ADMIN, autenticado por defecto).
    await request(server()).post(`/api/auth/admin/reset-password/${adminUserId}`).expect(401);
  });

  it('forgot-password responde 200 genérico para email inexistente y existente', async () => {
    await request(server())
      .post('/api/auth/forgot-password')
      .send({ email: `nadie_${unique}@nope.test` })
      .expect(200);
    await request(server()).post('/api/auth/forgot-password').send({ email }).expect(200);
  });

  it('reset-password con token inválido → 400 resetInvalid', async () => {
    const res = await request(server())
      .post('/api/auth/reset-password')
      .send({ token: 'token-que-no-existe', newPassword })
      .expect(400);
    expect(res.body.messageKey).toBe('auth.resetInvalid');
  });

  it('flujo completo: admin emite enlace, se aplica, cambia la credencial y es de un solo uso', async () => {
    // Una sesión viva del usuario, que debe quedar cerrada tras el reset.
    const live = (
      await request(server()).post('/api/auth/login').send({ email, password }).expect(200)
    ).body as { refreshToken: string };

    const issued = await request(server())
      .post(`/api/auth/admin/reset-password/${adminUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(issued.body.token).toBeDefined();
    expect(issued.body.resetLink).toContain('/reset-password?token=');

    // Aplica el token con la nueva contraseña.
    await request(server())
      .post('/api/auth/reset-password')
      .send({ token: issued.body.token, newPassword })
      .expect(200);

    // La sesión previa quedó cerrada (refresh revocado).
    await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: live.refreshToken })
      .expect(401);

    // La contraseña antigua ya no sirve; la nueva sí.
    await request(server()).post('/api/auth/login').send({ email, password }).expect(401);
    await request(server())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    // El token es de un solo uso: reaplicarlo falla.
    await request(server())
      .post('/api/auth/reset-password')
      .send({ token: issued.body.token, newPassword: 'Otr4Distinta!99' })
      .expect(400);
  });
});
