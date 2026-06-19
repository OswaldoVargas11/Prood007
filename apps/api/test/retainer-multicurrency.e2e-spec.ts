import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * RETAINER MULTI-MONEDA. Un despacho ES (base EUR) puede abrir la provisión de un expediente en OTRA
 * moneda (USD). La cuenta fija su moneda en el primer movimiento; depositar luego en otra moneda se
 * rechaza (un retainer = una moneda).
 */
describe('Retainer multi-currency (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let token = '';
  let matterId = '';

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
        tenantName: `Despacho retainer-mc ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `rmc_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    token = reg.body.tokens.accessToken;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `retainer-mc ${unique}` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('abre la provisión en USD (distinta de la base EUR del despacho)', async () => {
    await request(app.getHttpServer())
      .post('/api/retainer/deposit')
      .set(auth())
      .send({ matterId, amount: '500.00', kind: 'GENERICO', currency: 'USD' })
      .expect(201);
    const acc = await request(app.getHttpServer())
      .get(`/api/retainer/matter/${matterId}`)
      .set(auth())
      .expect(200);
    expect(acc.body.currency).toBe('USD');
  });

  it('rechaza un depósito posterior en otra moneda (un retainer = una moneda)', async () => {
    await request(app.getHttpServer())
      .post('/api/retainer/deposit')
      .set(auth())
      .send({ matterId, amount: '100.00', kind: 'GENERICO', currency: 'EUR' })
      .expect(400);
  });
});
