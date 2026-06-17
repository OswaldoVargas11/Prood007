import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/** E2E de KYC/AML: upsert del perfil, lectura, panel/summary y aislamiento por tenant (RLS). */
describe('KYC/AML (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let tenantA = '';
  let tokenA = '';
  let clientA = '';
  let tenantB = '';
  let tokenB = '';

  const reg = async (s: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${s}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `kyc_${s}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    return { tenantId: r.body.tenantId as string, token: r.body.tokens.accessToken as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await reg('A');
    tenantA = a.tenantId;
    tokenA = a.token;
    const b = await reg('B');
    tenantB = b.tenantId;
    tokenB = b.token;
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ name: 'Cliente KYC', taxId: '12345678Z' })
      .expect(201);
    clientA = c.body.id;
  });

  afterAll(async () => {
    for (const id of [tenantA, tenantB]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const A = () => ({ Authorization: `Bearer ${tokenA}` });
  const B = () => ({ Authorization: `Bearer ${tokenB}` });

  it('un cliente sin diligencia aún no tiene perfil', async () => {
    const res = await request(app.getHttpServer()).get(`/api/kyc/${clientA}`).set(A()).expect(200);
    // Nest serializa `null` como cuerpo vacío → supertest lo expone como {} (no como null).
    expect(res.body).toEqual({});
  });

  it('crea/actualiza el perfil KYC (upsert) y sella revisor/fecha', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/kyc/${clientA}`)
      .set(A())
      .send({ status: 'APPROVED', risk: 'LOW', identityVerified: true, isPep: false })
      .expect(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.risk).toBe('LOW');
    expect(res.body.reviewedAt).toBeTruthy();
  });

  it('rechaza valores fuera del catálogo (validación)', async () => {
    await request(app.getHttpServer())
      .put(`/api/kyc/${clientA}`)
      .set(A())
      .send({ status: 'NOPE' })
      .expect(400);
  });

  it('el panel y el resumen reflejan el estado', async () => {
    const overview = await request(app.getHttpServer()).get('/api/kyc').set(A()).expect(200);
    const row = overview.body.find((c: { clientId: string }) => c.clientId === clientA);
    expect(row.status).toBe('APPROVED');
    const summary = await request(app.getHttpServer()).get('/api/kyc/summary').set(A()).expect(200);
    expect(summary.body.byStatus.APPROVED).toBeGreaterThanOrEqual(1);
  });

  it('aislamiento: B no puede tocar el KYC de un cliente de A', async () => {
    await request(app.getHttpServer())
      .put(`/api/kyc/${clientA}`)
      .set(B())
      .send({ status: 'REJECTED' })
      .expect(400);
  });
});
