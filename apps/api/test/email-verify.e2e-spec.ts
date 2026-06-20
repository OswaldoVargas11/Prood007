import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

const SECRET = (process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret');

/** E2E de la verificación de email (anti-bots): auto-registro nace sin verificar, confirma con token. */
describe('Verificación de email (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  let jwt: JwtService;
  const unique = Date.now();
  const email = `verify_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  let tenantId: string;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    jwt = app.get(JwtService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Verify',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin Verify' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    userId = me.body.userId;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const verifyToken = (sub: string, typ = 'email_verify') =>
    jwt.sign({ sub, typ }, { secret: SECRET, expiresIn: 3600 });

  it('un auto-registro nace SIN verificar', async () => {
    const me = await request(server()).get('/api/auth/me').set(auth()).expect(200);
    expect(me.body.emailVerified).toBe(false);
  });

  it('verify-email con token inválido → 401', async () => {
    const res = await request(server())
      .post('/api/auth/verify-email')
      .send({ token: 'no-vale' })
      .expect(401);
    expect(res.body.messageKey).toBe('verify.invalidToken');
  });

  it('verify-email con token de tipo equivocado → 401', async () => {
    const res = await request(server())
      .post('/api/auth/verify-email')
      .send({ token: verifyToken(userId, 'otro') })
      .expect(401);
    expect(res.body.messageKey).toBe('verify.invalidToken');
  });

  it('verify-email con token válido confirma el email', async () => {
    await request(server())
      .post('/api/auth/verify-email')
      .send({ token: verifyToken(userId) })
      .expect(200);
    const me = await request(server()).get('/api/auth/me').set(auth()).expect(200);
    expect(me.body.emailVerified).toBe(true);
  });

  it('resend-verification (ya verificado) responde OK sin reenviar', async () => {
    const res = await request(server())
      .post('/api/auth/resend-verification')
      .set(auth())
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('resend-verification de un usuario NO verificado responde OK', async () => {
    // Volvemos a marcarlo sin verificar para cubrir la rama de envío del reenvío.
    await system.user.update({ where: { id: userId }, data: { emailVerified: false } });
    const res = await request(server())
      .post('/api/auth/resend-verification')
      .set(auth())
      .expect(200);
    expect(res.body.success).toBe(true);
  });

  it('resend-verification sin sesión → 401', async () => {
    await request(server()).post('/api/auth/resend-verification').expect(401);
  });
});
