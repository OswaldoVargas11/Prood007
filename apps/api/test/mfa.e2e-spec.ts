import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';
import {
  base32Encode,
  generateTotp,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../src/auth/totp.util';

// La MFA cifra el secreto con DATA_ENCRYPTION_KEY; garantizamos una clave válida en el entorno de test.
process.env.DATA_ENCRYPTION_KEY =
  process.env.DATA_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString('base64');

/**
 * E2E de la verificación en dos pasos (2FA TOTP): unidad del algoritmo (RFC 6238) + flujo completo de
 * endpoints (setup → enable → login con desafío → verificación TOTP/respaldo → disable) y ramas de error.
 */
describe('MFA / 2FA (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const email = `mfa_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  let tenantId: string;
  let token: string;

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
        tenantName: 'Despacho MFA',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin MFA' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const server = () => app.getHttpServer();
  const auth = () => ({ Authorization: `Bearer ${token}` });

  // ── Unidad: TOTP (RFC 6238) ────────────────────────────────────────────────
  it('TOTP coincide con los vectores de prueba de la RFC 6238', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
    // verifyTotp devuelve el contador de ventana (≥0) si valida, o -1 si no.
    expect(verifyTotp(secret, '287082', 59_000)).toBeGreaterThanOrEqual(0);
    expect(verifyTotp(secret, '050471', 1111111111_000)).toBeGreaterThanOrEqual(0);
    expect(verifyTotp(secret, '005924', 1234567890_000)).toBeGreaterThanOrEqual(0);
    // generateTotp produce el mismo código que verifica el verificador.
    expect(verifyTotp(secret, generateTotp(secret, 59_000), 59_000)).toBeGreaterThanOrEqual(0);
  });

  it('verifyTotp rechaza formatos inválidos y códigos incorrectos', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, 'abc')).toBe(-1);
    expect(verifyTotp(secret, '12345')).toBe(-1);
    expect(verifyTotp(secret, '000000', 0)).toBe(-1);
    expect(otpauthUri(secret, email)).toContain('otpauth://totp/');
  });

  // ── Flujo de endpoints ──────────────────────────────────────────────────────
  let secret: string;
  let backupCodes: string[];

  it('status inicial = desactivado', async () => {
    const res = await request(server()).get('/api/auth/mfa/status').set(auth()).expect(200);
    expect(res.body.enabled).toBe(false);
  });

  it('enable sin setup previo → mfa.notStarted', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/enable')
      .set(auth())
      .send({ code: '000000' })
      .expect(400);
    expect(res.body.messageKey).toBe('mfa.notStarted');
  });

  it('setup devuelve secreto + QR', async () => {
    const res = await request(server()).post('/api/auth/mfa/setup').set(auth()).expect(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.otpauthUri).toContain('otpauth://');
    secret = res.body.secret;
  });

  it('enable con código incorrecto → mfa.invalidCode', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/enable')
      .set(auth())
      .send({ code: '111111' })
      .expect(400);
    expect(res.body.messageKey).toBe('mfa.invalidCode');
  });

  it('enable con código correcto activa MFA y entrega códigos de respaldo', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/enable')
      .set(auth())
      .send({ code: generateTotp(secret) })
      .expect(200);
    expect(Array.isArray(res.body.backupCodes)).toBe(true);
    expect(res.body.backupCodes).toHaveLength(10);
    backupCodes = res.body.backupCodes;
    const st = await request(server()).get('/api/auth/mfa/status').set(auth()).expect(200);
    expect(st.body.enabled).toBe(true);
  });

  it('enable de nuevo estando ya activada → mfa.alreadyEnabled', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/enable')
      .set(auth())
      .send({ code: generateTotp(secret) })
      .expect(400);
    expect(res.body.messageKey).toBe('mfa.alreadyEnabled');
  });

  it('login ahora devuelve un desafío MFA (sin sesión)', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.mfaRequired).toBe(true);
    expect(res.body.mfaToken).toBeDefined();
    expect(res.body.accessToken).toBeUndefined();
  });

  it('mfa/login con código TOTP emite la sesión', async () => {
    const ch = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const res = await request(server())
      .post('/api/auth/mfa/login')
      .send({ mfaToken: ch.body.mfaToken, code: generateTotp(secret) })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('mfa/login con código incorrecto → 401', async () => {
    const ch = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const res = await request(server())
      .post('/api/auth/mfa/login')
      .send({ mfaToken: ch.body.mfaToken, code: '111111' })
      .expect(401);
    expect(res.body.messageKey).toBe('mfa.invalidCode');
  });

  it('mfa/login con token de desafío inválido → 401', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/login')
      .send({ mfaToken: 'no-es-un-token', code: generateTotp(secret) })
      .expect(401);
    expect(res.body.messageKey).toBe('mfa.invalidChallenge');
  });

  it('mfa/login con un código de respaldo funciona y lo consume', async () => {
    const ch = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const ok = await request(server())
      .post('/api/auth/mfa/login')
      .send({ mfaToken: ch.body.mfaToken, code: backupCodes[0] })
      .expect(200);
    expect(ok.body.accessToken).toBeDefined();

    // El mismo código de respaldo ya no debe servir (un solo uso).
    const ch2 = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    await request(server())
      .post('/api/auth/mfa/login')
      .send({ mfaToken: ch2.body.mfaToken, code: backupCodes[0] })
      .expect(401);
  });

  it('disable con código incorrecto → mfa.invalidCode', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/disable')
      .set(auth())
      .send({ code: '111111' })
      .expect(400);
    expect(res.body.messageKey).toBe('mfa.invalidCode');
  });

  it('disable con código correcto desactiva MFA', async () => {
    // Código de respaldo (no TOTP): el TOTP de esta misma ventana ya se usó en el login y el anti-replay
    // lo rechazaría. Un código de respaldo es igualmente válido para desactivar.
    await request(server())
      .post('/api/auth/mfa/disable')
      .set(auth())
      .send({ code: backupCodes[1] })
      .expect(200);
    const st = await request(server()).get('/api/auth/mfa/status').set(auth()).expect(200);
    expect(st.body.enabled).toBe(false);
    // Y el login vuelve a ser directo (sin desafío).
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('disable estando ya desactivada → mfa.notEnabled', async () => {
    const res = await request(server())
      .post('/api/auth/mfa/disable')
      .set(auth())
      .send({ code: '000000' })
      .expect(400);
    expect(res.body.messageKey).toBe('mfa.notEnabled');
  });
});
