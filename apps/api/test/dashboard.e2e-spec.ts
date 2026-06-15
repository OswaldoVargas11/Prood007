import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/** E2E del resumen del panel principal (agregados por tenant, solo lectura). */
describe('Dashboard summary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  let token: string;
  let tenantId: string;
  const unique = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Dashboard Test',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: {
          email: `dash_${unique}@despacho.test`,
          password: 'Sup3rSecret!2026',
          fullName: 'Dash Admin',
        },
      })
      .expect(201);
    token = res.body.tokens.accessToken;
    tenantId = res.body.tenantId;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  it('devuelve la forma esperada del resumen', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.currency).toBe('EUR');
    expect(res.body.kpis).toMatchObject({
      activeMatters: expect.any(Number),
      totalClients: expect.any(Number),
      pendingReviews: expect.any(Number),
    });
    expect(typeof res.body.kpis.billableThisMonth).toBe('string');
    expect(Array.isArray(res.body.revenueByMonth)).toBe(true);
    expect(res.body.revenueByMonth).toHaveLength(6);
    expect(Array.isArray(res.body.deadlines)).toBe(true);
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });

  it('rechaza sin autenticación', async () => {
    await request(app.getHttpServer()).get('/api/dashboard/summary').expect(401);
  });
});
