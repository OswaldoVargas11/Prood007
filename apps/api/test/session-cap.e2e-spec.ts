import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';
import { createValidationPipe } from '../src/common/validation';

/**
 * E2E del tope ABSOLUTO de sesión (SEC2): una sesión activa deja de "deslizar" para siempre.
 * Cubre: la rotación ARRASTRA el tope (no lo extiende) y, superado el tope, la rotación se rechaza
 * con `auth.sessionExpired`. Requiere Postgres migrado.
 */
describe('Session absolute cap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const email = `cap_admin_${unique}@despacho.test`;
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

    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Cap',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin Cap' },
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

  it('al iniciar sesión, el refresh recibe un tope absoluto (~30 días)', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const row = await prisma.refreshToken.findFirst({
      where: { tokenHash: { not: 'pending' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.absoluteExpiresAt).toBeTruthy();
    const days = (row!.absoluteExpiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    expect(login.body.refreshToken).toBeDefined();
  });

  it('la rotación ARRASTRA el tope absoluto (no lo extiende)', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const before = await prisma.refreshToken.findFirst({
      where: { tokenHash: { not: 'pending' } },
      orderBy: { createdAt: 'desc' },
    });
    const cap = before!.absoluteExpiresAt!.getTime();

    const rotated = await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    const after = await prisma.refreshToken.findFirst({
      where: { tokenHash: { not: 'pending' }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    // Mismo tope: la rotación no resetea la cuenta atrás absoluta.
    expect(after!.absoluteExpiresAt!.getTime()).toBe(cap);
    expect(rotated.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('superado el tope absoluto, la rotación se rechaza con sessionExpired', async () => {
    const login = await request(server())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    // Simula el paso del tiempo: empuja el tope absoluto al pasado para la sesión recién creada.
    await prisma.refreshToken.updateMany({
      where: { revokedAt: null, tokenHash: { not: 'pending' } },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(server())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(res.body.messageKey).toBe('auth.sessionExpired');
  });
});
