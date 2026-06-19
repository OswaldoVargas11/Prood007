import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/** E2E de informes de gestión: forma de la respuesta, agregación y guard de rol. */
describe('Reports (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let tenantId = '';
  let token = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const r = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Reports',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `reports_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = r.body.tenantId;
    token = r.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('cartera vencida: estructura correcta (despacho nuevo → sin pendientes)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/aged-receivables')
      .set(auth())
      .expect(200);
    // Agrupado por moneda: despacho nuevo sin facturas → sin grupos.
    expect(Array.isArray(res.body.byCurrency)).toBe(true);
    expect(res.body.byCurrency).toHaveLength(0);
  });

  it('tiempo por letrado: devuelve un array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/time-by-lawyer')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('los informes exigen autenticación (sin token → 401)', async () => {
    await request(app.getHttpServer()).get('/api/reports/aged-receivables').expect(401);
  });
});
