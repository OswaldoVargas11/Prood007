import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Company secretary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';
  let tenantBId = '';
  let tokenB = '';
  let clientId = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function registerTenant(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${email}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin' },
      })
      .expect(201);
    return { tenantId: res.body.tenantId as string, token: res.body.tokens.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`csadmin_${unique}@d.test`);
    tenantId = a.tenantId;
    token = a.token;
    const b = await registerTenant(`csadminb_${unique}@d.test`);
    tenantBId = b.tenantId;
    tokenB = b.token;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(token))
      .send({ name: 'Sociedad Alfa SL', taxId: 'B12345674' })
      .expect(201);
    clientId = client.body.id;
  });

  afterAll(async () => {
    for (const id of [tenantId, tenantBId]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  it('registra socios y calcula el total de participaciones', async () => {
    await request(app.getHttpServer())
      .post(`/api/company-secretary/${clientId}/shareholders`)
      .set(auth(token))
      .send({ name: 'Ana', units: 60 })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/api/company-secretary/${clientId}/shareholders`)
      .set(auth(token))
      .send({ name: 'Beto', units: 40 })
      .expect(201);
    expect(res.body.totalUnits).toBe(100);
    expect(res.body.shareholders).toHaveLength(2);
  });

  it('añade un acta al libro de actas', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/company-secretary/${clientId}/minutes`)
      .set(auth(token))
      .send({
        kind: 'GENERAL_MEETING',
        title: 'Junta ordinaria 2026',
        meetingDate: '2026-06-30',
        body: 'Aprobación de cuentas.',
      })
      .expect(201);
    expect(res.body.minutes).toHaveLength(1);
  });

  it('registra una transmisión de participaciones', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/company-secretary/${clientId}/transfers`)
      .set(auth(token))
      .send({ fromName: 'Ana', toName: 'Carla', units: 10, date: '2026-06-15' })
      .expect(201);
    expect(res.body.transfers).toHaveLength(1);
  });

  it('una obligación anual, al marcarse presentada, programa la del año siguiente', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/company-secretary/${clientId}/obligations`)
      .set(auth(token))
      .send({ title: 'Depósito de cuentas anuales', dueDate: '2026-07-31', recurrence: 'ANNUAL' })
      .expect(201);
    const obl = created.body.obligations[0];

    const after = await request(app.getHttpServer())
      .patch(`/api/company-secretary/obligations/${obl.id}`)
      .set(auth(token))
      .send({ status: 'FILED' })
      .expect(200);
    // La presentada + la nueva del año siguiente = 2.
    expect(after.body.obligations).toHaveLength(2);
    const next = after.body.obligations.find((o: { dueDate: string }) =>
      o.dueDate.startsWith('2027'),
    );
    expect(next).toBeTruthy();
    expect(next.status).toBe('PENDING');
  });

  it('AISLAMIENTO: el tenant B no ve la secretaría del cliente de A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/company-secretary/${clientId}`)
      .set(auth(tokenB))
      .expect(404);
  });
});
