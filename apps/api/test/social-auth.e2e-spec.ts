import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

// Configura SOLO Google (Microsoft queda sin configurar a propósito, para cubrir la rama "no configurado").
const SECRET = (process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret');
process.env.GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'https://api.lawzora.com/api/integrations/google/callback';
delete process.env.MS_CLIENT_ID;
process.env.APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://lawzora.com';
process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY || Buffer.alloc(32, 9).toString('base64');

// El id_token que devolvería Google: lo controla cada test mediante `mockClaims`.
let mockClaims: Record<string, unknown> = {};
let mockTokenOk = true;
const realFetch = global.fetch;

/** E2E del login social: flujo OAuth con la llamada al endpoint de token del proveedor mockeada. */
describe('Login social (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  let jwt: JwtService;
  const unique = Date.now();
  const email = `social_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  let tenantId: string;

  beforeAll(async () => {
    // Mock de fetch: intercepta SOLO el endpoint de token del proveedor; el resto pasa al fetch real.
    global.fetch = ((url: unknown, init?: unknown) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com/token') || u.includes('login.microsoftonline.com')) {
        if (!mockTokenOk) return Promise.resolve(new Response('nope', { status: 400 }));
        // Los id_token reales llevan `aud` (= clientId) y `exp`; el servidor ahora los valida.
        const claims = {
          aud: u.includes('googleapis') ? process.env.GOOGLE_CLIENT_ID : process.env.MS_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 600,
          ...mockClaims,
        };
        const idToken = 'h.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.s';
        return Promise.resolve(
          new Response(JSON.stringify({ id_token: idToken }), { status: 200 }),
        );
      }
      return (realFetch as typeof fetch)(url as never, init as never);
    }) as typeof fetch;

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
        tenantName: 'Despacho Social',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin Social' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
  });

  afterAll(async () => {
    global.fetch = realFetch;
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  const server = () => app.getHttpServer();
  const state = (p = 'google') =>
    jwt.sign({ typ: 'soc_state', p }, { secret: SECRET, expiresIn: 600 });

  it('providers refleja lo configurado (google sí, microsoft no)', async () => {
    const res = await request(server()).get('/api/auth/social/providers').expect(200);
    expect(res.body).toEqual({ google: true, microsoft: false });
  });

  it('start de google redirige a accounts.google.com', async () => {
    const res = await request(server()).get('/api/auth/social/google').expect(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.location).toContain('scope=openid+email+profile');
  });

  it('start de un proveedor no configurado (microsoft) → 501', async () => {
    await request(server()).get('/api/auth/social/microsoft').expect(501);
  });

  it('start de un proveedor desconocido → redirige con error', async () => {
    const res = await request(server()).get('/api/auth/social/otro').expect(302);
    expect(res.headers.location).toContain('social_error=provider');
  });

  it('callback sin code → error de callback', async () => {
    const res = await request(server()).get('/api/auth/social/google/callback').expect(302);
    expect(res.headers.location).toContain('social_error=callback');
  });

  it('callback con state inválido → error de state', async () => {
    const res = await request(server())
      .get('/api/auth/social/google/callback?code=x&state=basura')
      .expect(302);
    expect(res.headers.location).toContain('social_error=state');
  });

  it('callback con email no verificado → error unverified', async () => {
    mockClaims = { email, email_verified: false };
    mockTokenOk = true;
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${state()}`)
      .expect(302);
    expect(res.headers.location).toContain('social_error=unverified');
  });

  it('callback con un email desconocido → error no_account', async () => {
    mockClaims = { email: `nadie_${unique}@x.test`, email_verified: true };
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${state()}`)
      .expect(302);
    expect(res.headers.location).toContain('social_error=no_account');
  });

  it('callback con fallo al intercambiar el code → error exchange', async () => {
    mockTokenOk = false;
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${state()}`)
      .expect(302);
    expect(res.headers.location).toContain('social_error=exchange');
    mockTokenOk = true;
  });

  it('flujo correcto: callback → ticket → exchange → sesión', async () => {
    mockClaims = { email, email_verified: true };
    const cb = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${state()}`)
      .expect(302);
    const loc = cb.headers.location as string;
    expect(loc).toContain('social_ticket=');
    const ticket = new URL(loc).searchParams.get('social_ticket')!;
    const ex = await request(server())
      .post('/api/auth/social/exchange')
      .send({ ticket })
      .expect(200);
    expect(ex.body.accessToken).toBeDefined();
    expect(ex.body.refreshToken).toBeDefined();
  });

  it('exchange con ticket inválido → 401', async () => {
    const res = await request(server())
      .post('/api/auth/social/exchange')
      .send({ ticket: 'no-vale' })
      .expect(401);
    expect(res.body.messageKey).toBe('social.invalidTicket');
  });

  it('si el usuario tiene MFA, el exchange devuelve un desafío MFA', async () => {
    // Login normal para obtener token y activar MFA en el usuario.
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const setup = await request(server())
      .post('/api/auth/mfa/setup')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    const { generateTotp } = await import('../src/auth/totp.util');
    await request(server())
      .post('/api/auth/mfa/enable')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ code: generateTotp(setup.body.secret) })
      .expect(200);

    mockClaims = { email, email_verified: true };
    const cb = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${state()}`)
      .expect(302);
    const ticket = new URL(cb.headers.location as string).searchParams.get('social_ticket')!;
    const ex = await request(server())
      .post('/api/auth/social/exchange')
      .send({ ticket })
      .expect(200);
    expect(ex.body.mfaRequired).toBe(true);
    expect(ex.body.mfaToken).toBeDefined();
    expect(ex.body.accessToken).toBeUndefined();
  });
});
