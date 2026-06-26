import { createSign, generateKeyPairSync } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { SOCIAL_STATE_COOKIE } from '../src/auth/social-auth.service';
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

// Par RSA del "IdP": el servidor verifica la FIRMA del id_token contra este JWKS (mock de fetch).
const KID = 'test-kid';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_JWK = {
  ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
  kid: KID,
  use: 'sig',
  alg: 'RS256',
};

// Estado controlado por cada test: claims del id_token, si el token-endpoint responde OK, el nonce OIDC
// vigente, y palancas para forzar ramas del verificador (kid, alg, JWKS caído, id_token crudo).
let mockClaims: Record<string, unknown> = {};
let mockTokenOk = true;
let currentNonce = 'n0';
let mockKid = KID;
let mockAlg = 'RS256';
let mockJwksOk = true;
let mockRawIdToken: string | null | 'sign' = 'sign';
const realFetch = global.fetch;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** Firma un id_token con la clave del "IdP" (lo que devolvería el token-endpoint del proveedor). */
function signIdToken(claims: Record<string, unknown>, kid = KID, alg = 'RS256'): string {
  const header = { alg, typ: 'JWT', kid };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  if (alg === 'none') return `${signingInput}.`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  return `${signingInput}.${b64url(signer.sign(privateKey))}`;
}

/** E2E del login social: token-endpoint + JWKS del proveedor mockeados; cookie de flujo + nonce reales. */
describe('Login social (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  let jwt: JwtService;
  const unique = Date.now();
  const email = `social_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  let tenantId: string;

  beforeAll(async () => {
    // Mock de fetch: intercepta el JWKS y el token-endpoint del proveedor; el resto pasa al fetch real.
    global.fetch = ((url: unknown, init?: unknown) => {
      const u = String(url);
      if (u.includes('/oauth2/v3/certs') || u.includes('/discovery/v2.0/keys')) {
        if (!mockJwksOk) return Promise.resolve(new Response('nope', { status: 500 }));
        return Promise.resolve(
          new Response(JSON.stringify({ keys: [PUBLIC_JWK] }), { status: 200 }),
        );
      }
      if (u.includes('oauth2.googleapis.com/token') || u.includes('login.microsoftonline.com')) {
        if (!mockTokenOk) return Promise.resolve(new Response('nope', { status: 400 }));
        const claims = {
          iss: 'https://accounts.google.com',
          aud: u.includes('googleapis') ? process.env.GOOGLE_CLIENT_ID : process.env.MS_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 600,
          iat: Math.floor(Date.now() / 1000),
          nonce: currentNonce,
          ...mockClaims,
        };
        const idToken =
          mockRawIdToken === 'sign' ? signIdToken(claims, mockKid, mockAlg) : mockRawIdToken;
        const respBody = idToken === null ? {} : { id_token: idToken };
        return Promise.resolve(new Response(JSON.stringify(respBody), { status: 200 }));
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

  afterEach(() => {
    mockClaims = {};
    mockTokenOk = true;
    mockKid = KID;
    mockAlg = 'RS256';
    mockJwksOk = true;
    mockRawIdToken = 'sign';
  });

  const server = () => app.getHttpServer();

  /**
   * Prepara un flujo OAuth válido: fija el nonce vigente (lo reflejará el id_token mockeado), firma el
   * `state` con ese nonce y construye la cookie HttpOnly del flujo (nonce + code_verifier). M-1: la cookie
   * es obligatoria, así que todos los callback "de éxito" deben enviarla.
   */
  function flow(p = 'google') {
    const nonce = `nonce-${unique}-${Math.floor(Math.random() * 1e9)}`;
    currentNonce = nonce;
    const st = jwt.sign({ typ: 'soc_state', p, n: nonce }, { secret: SECRET, expiresIn: 600 });
    const cookie = `${SOCIAL_STATE_COOKIE}=${encodeURIComponent(
      JSON.stringify({ n: nonce, v: 'verifier-x' }),
    )}`;
    return { state: st, cookie };
  }

  it('providers refleja lo configurado (google sí, microsoft no)', async () => {
    const res = await request(server()).get('/api/auth/social/providers').expect(200);
    expect(res.body).toEqual({ google: true, microsoft: false });
  });

  it('start de google redirige a accounts.google.com (con nonce)', async () => {
    const res = await request(server()).get('/api/auth/social/google').expect(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.headers.location).toContain('scope=openid+email+profile');
    expect(res.headers.location).toContain('nonce=');
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

  it('callback SIN cookie de flujo → error de state (M-1: la cookie es obligatoria)', async () => {
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .expect(302);
    expect(res.headers.location).toContain('social_error=state');
  });

  it('callback con state inválido (con cookie) → error de state', async () => {
    const f = flow();
    const res = await request(server())
      .get('/api/auth/social/google/callback?code=x&state=basura')
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=state');
  });

  it('callback con email no verificado → error unverified', async () => {
    mockClaims = { email, email_verified: false };
    mockTokenOk = true;
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=unverified');
  });

  it('callback con un email desconocido → error no_account', async () => {
    mockClaims = { email: `nadie_${unique}@x.test`, email_verified: true };
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=no_account');
  });

  it('callback con id_token cuyo nonce no coincide → error id_token', async () => {
    mockClaims = { email, email_verified: true, nonce: 'nonce-distinto' };
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=id_token');
  });

  // Casos que ejercitan las ramas del verificador OIDC (firma JWKS) por el flujo HTTP real (H-1).
  it.each([
    [
      'id_token caducado',
      { email, email_verified: true, exp: Math.floor(Date.now() / 1000) - 100 },
    ],
    ['aud incorrecto', { email, email_verified: true, aud: 'otro-cliente' }],
    ['iss no confiable', { email, email_verified: true, iss: 'https://evil.example' }],
  ])('callback con %s → error id_token', async (_label, claims) => {
    mockClaims = claims as Record<string, unknown>;
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=id_token');
  });

  it('callback con id_token malformado (no 3 partes) → error id_token', async () => {
    mockRawIdToken = 'a.b';
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=id_token');
  });

  it('callback con alg:none → error id_token (anti algoritmo nulo)', async () => {
    mockAlg = 'none';
    mockClaims = { email, email_verified: true };
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=id_token');
  });

  it('callback con kid desconocido (no casa con el JWKS) → error id_token', async () => {
    mockKid = 'kid-inexistente';
    mockClaims = { email, email_verified: true };
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=id_token');
  });

  it('callback sin id_token en la respuesta del proveedor → error no_id_token', async () => {
    mockRawIdToken = null;
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=no_id_token');
  });

  it('callback con fallo al intercambiar el code → error exchange', async () => {
    mockTokenOk = false;
    const f = flow();
    const res = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
      .expect(302);
    expect(res.headers.location).toContain('social_error=exchange');
    mockTokenOk = true;
  });

  it('flujo correcto: callback → ticket → exchange → sesión', async () => {
    mockClaims = { email, email_verified: true };
    const f = flow();
    const cb = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
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
    const f = flow();
    const cb = await request(server())
      .get(`/api/auth/social/google/callback?code=x&state=${f.state}`)
      .set('Cookie', f.cookie)
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
