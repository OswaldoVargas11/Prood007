import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

/**
 * E2E de autenticación multi-tenant + RBAC contra Postgres real.
 * Requiere la base de datos levantada (docker compose up -d postgres) y migrada.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const adminEmail = `admin_${unique}@despacho.test`;
  const password = 'Sup3rSecret!2026';
  let tenantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Limpieza: borra el tenant de prueba (cascada elimina usuarios, roles, tokens).
    if (tenantId) {
      await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('registra un tenant ES y devuelve tokens + admin con rol FIRM_ADMIN', async () => {
    const res = await request(server())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Prueba',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: adminEmail, password, fullName: 'Admin Uno' },
      })
      .expect(201);

    expect(res.body.tenantId).toBeDefined();
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();
    tenantId = res.body.tenantId;
  });

  it('rechaza el registro con contraseña demasiado corta (validación DTO)', async () => {
    await request(server())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'X',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `x_${unique}@t.test`, password: 'short', fullName: 'X' },
      })
      .expect(400);
  });

  it('login correcto devuelve un par de tokens', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('login con contraseña incorrecta → 401 con messageKey traducible', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'incorrecta' })
      .expect(401);
    // i18n de la API: el error sale por messageKey (no por string hardcodeado).
    expect(res.body.messageKey).toBe('auth.invalidCredentials');
  });

  it('error de validación de DTO → 400 con messageKey validation.failed', async () => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ email: 'no-es-email', password: 'x' })
      .expect(400);
    expect(res.body.messageKey).toBe('validation.failed');
  });

  it('/auth/me sin token → 401', async () => {
    await request(server()).get('/api/auth/me').expect(401);
  });

  it('/auth/me con access token devuelve el usuario y su rol', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const res = await request(server())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(adminEmail);
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.jurisdiction).toBe('es');
    expect(res.body.roles).toContain('FIRM_ADMIN');
  });

  it('refresh rota el token y el antiguo deja de servir (detección de reutilización)', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const oldRefresh = login.body.refreshToken;

    const rotated = await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(200);
    expect(rotated.body.refreshToken).toBeDefined();
    expect(rotated.body.refreshToken).not.toBe(oldRefresh);

    // Reutilizar el refresh viejo (ya revocado) debe fallar.
    await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh })
      .expect(401);
  });

  it('health es público', async () => {
    await request(server()).get('/api/health').expect(200);
  });
});
