import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Correo de bienvenida/INVITACIÓN al crear una cuenta (cliente de portal o personal): al alta se
 * emite un token de ACTIVACIÓN y se manda el enlace. En CI no hay SMTP (proveedor Noop), así que no
 * se envía correo, pero el TOKEN de activación SÍ se crea — eso es lo que verificamos aquí.
 */
describe('Account invite email (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let adminToken = '';

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
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`inviteadmin_${unique}@d.test`);
    tenantId = a.tenantId;
    adminToken = a.token;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('al dar de alta un CLIENTE de portal se emite un token de activación (correo de invitación)', async () => {
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Cliente Invitado', taxId: '12345678Z' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/clients/${client.body.id}/portal-user`)
      .set(auth(adminToken))
      .send({
        email: `invite_cliente_${unique}@d.test`,
        password,
        fullName: 'Cliente Invitado',
      })
      .expect(201);

    const userId = res.body.userId as string;
    const tokens = await system.passwordReset.count({ where: { userId } });
    expect(tokens).toBeGreaterThanOrEqual(1);
  });

  it('al dar de alta PERSONAL (letrado) se emite un token de activación (correo de invitación)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(adminToken))
      .send({
        email: `invite_letrado_${unique}@d.test`,
        password,
        fullName: 'Letrado Invitado',
        role: 'LAWYER',
      })
      .expect(201);

    const userId = res.body.id as string;
    const tokens = await system.passwordReset.count({ where: { userId } });
    expect(tokens).toBeGreaterThanOrEqual(1);
  });
});
