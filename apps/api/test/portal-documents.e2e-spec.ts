import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * Portal · subida de documentos por el cliente. El cliente puede subir a SU propio expediente (DNI,
 * contrato…); el documento nace PENDING de revisión del despacho. Acotado por `assertMatterAccess`.
 */
describe('Portal · subida de documentos (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let adminToken = '';
  let tenantId = '';
  let clientToken = '';
  let matterId = '';

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
        tenantName: `Despacho pdoc_${unique}@d.test`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `pdoc_${unique}@d.test`, password, fullName: 'Admin' },
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
      .send({ email: `pdocc_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `pdocc_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = login.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  it('el cliente sube un documento a su expediente y queda PENDING de revisión', async () => {
    const up = await request(app.getHttpServer())
      .post(`/api/portal/matters/${matterId}/documents`)
      .set(bearer(clientToken))
      .attach('file', Buffer.from('contenido de prueba'), 'dni.pdf')
      .field('name', 'Mi DNI')
      .expect(201);
    expect(up.body.document.name).toBe('Mi DNI');
    expect(up.body.version.reviewStatus).toBe('PENDING');

    const list = await request(app.getHttpServer())
      .get(`/api/portal/matters/${matterId}/documents`)
      .set(bearer(clientToken))
      .expect(200);
    expect(list.body.some((d: { name: string }) => d.name === 'Mi DNI')).toBe(true);
  });

  it('el cliente NO puede subir a un expediente inexistente (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/portal/matters/no-existe/documents')
      .set(bearer(clientToken))
      .attach('file', Buffer.from('x'), 'x.pdf')
      .expect(404);
  });
});
