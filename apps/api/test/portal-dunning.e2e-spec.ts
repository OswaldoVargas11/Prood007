import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Portal · recordatorio de cobro (PR-D5). El cliente no puede llamar a `/dunning/*` (es staff-only),
 * así que el recordatorio del portal se deriva de que SU factura esté vencida: `GET /portal/invoices`
 * expone `overdue` (misma regla que el despacho). Aquí se verifica esa derivación y el ámbito propio.
 */
describe('Portal · recordatorio de factura vencida (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let tenantId = '';
  let clientToken = '';
  let overdueId = '';
  let currentId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho pdun_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `pdun_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    adminToken = reg.body.tokens.accessToken;
    tenantId = reg.body.tenantId;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente portal', taxId: '12345678Z' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `pdunc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `pdunc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    const overdue = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId: matter.body.id,
        dueDate: '2020-01-01',
        lines: [{ description: 'Vieja', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    overdueId = overdue.body.invoice.id;
    const current = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId: matter.body.id,
        dueDate: '2999-01-01',
        lines: [{ description: 'Nueva', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    currentId = current.body.invoice.id;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('el portal marca overdue=true en la factura vencida y false en la vigente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/portal/invoices')
      .set(bearer(clientToken))
      .expect(200);
    const byId = new Map(
      (res.body as { id: string; overdue: boolean; dueDate: string | null }[]).map((i) => [
        i.id,
        i,
      ]),
    );
    expect(byId.get(overdueId)?.overdue).toBe(true);
    expect(byId.get(currentId)?.overdue).toBe(false);
    // El portal expone dueDate para que la UI muestre el recordatorio.
    expect(byId.get(overdueId)?.dueDate).toBeTruthy();
  });
});
