import type { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Portal, chat & realtime (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  let baseUrl = '';
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let adminToken = '';
  let lawyerToken = '';
  let lawyerUserId = '';
  let clientToken = '';
  let clientId = '';
  let matterId = '';
  let otherMatterId = '';

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

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
    await app.listen(0);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `padmin_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    adminToken = reg.body.tokens.accessToken;

    // Abogado (para realtime).
    const lawyerRole = await system.role.findFirstOrThrow({ where: { tenantId, code: 'LAWYER' } });
    const lawyer = await system.user.create({
      data: {
        tenantId,
        email: `plawyer_${unique}@d.test`,
        passwordHash: await argon2.hash(password),
        fullName: 'Abogada',
        roles: { create: [{ roleId: lawyerRole.id }] },
      },
    });
    lawyerUserId = lawyer.id;
    const lawyerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `plawyer_${unique}@d.test`, password, tenantId })
      .expect(200);
    lawyerToken = lawyerLogin.body.accessToken;

    // Cliente + usuario de portal + expediente.
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Cliente Portal', taxId: '12345678Z' })
      .expect(201);
    clientId = client.body.id;
    await request(app.getHttpServer())
      .post(`/api/clients/${clientId}/portal-user`)
      .set(bearer(adminToken))
      .send({ email: `pclient_${unique}@d.test`, password, fullName: 'Cliente' })
      .expect(201);
    const clientLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `pclient_${unique}@d.test`, password, tenantId })
      .expect(200);
    clientToken = clientLogin.body.accessToken;

    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Asunto Portal', type: 'civil', clientId })
      .expect(201);
    matterId = matter.body.id;

    // Otro cliente + expediente (para probar que el cliente no accede a lo ajeno).
    const other = await request(app.getHttpServer())
      .post('/api/clients')
      .set(bearer(adminToken))
      .send({ name: 'Otro', taxId: 'X1234567L' })
      .expect(201);
    const otherMatter = await request(app.getHttpServer())
      .post('/api/matters')
      .set(bearer(adminToken))
      .send({ title: 'Ajeno', type: 'civil', clientId: other.body.id })
      .expect(201);
    otherMatterId = otherMatter.body.id;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  // ── Portal ────────────────────────────────────────────────────────────────
  it('el cliente ve sus expedientes en el portal', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/portal/matters')
      .set(bearer(clientToken))
      .expect(200);
    expect(res.body.map((m: { id: string }) => m.id)).toContain(matterId);
  });

  it('el cliente ve el ledger de su expediente', async () => {
    await request(app.getHttpServer())
      .get(`/api/portal/matters/${matterId}/ledger`)
      .set(bearer(clientToken))
      .expect(200);
  });

  it('el cliente NO accede a un expediente ajeno (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/portal/matters/${otherMatterId}`)
      .set(bearer(clientToken))
      .expect(403);
  });

  it('el cliente descarga el PDF de SU factura (200 application/pdf) pero no el de una ajena (404)', async () => {
    const ownInv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    const otherInv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(bearer(adminToken))
      .send({
        matterId: otherMatterId,
        lines: [{ description: 'Ajena', quantity: '1', unitPrice: '50', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/portal/invoices/${ownInv.body.invoice.id}/pdf`)
      .set(bearer(clientToken))
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // Aislamiento: no puede descargar la factura de otro cliente.
    await request(app.getHttpServer())
      .get(`/api/portal/invoices/${otherInv.body.invoice.id}/pdf`)
      .set(bearer(clientToken))
      .expect(404);
  });

  it('un admin no puede usar el portal de cliente (403 por rol)', async () => {
    await request(app.getHttpServer())
      .get('/api/portal/matters')
      .set(bearer(adminToken))
      .expect(403);
  });

  // ── Chat ────────────────────────────────────────────────────────────────
  it('el cliente publica un mensaje en su expediente y el abogado lo ve', async () => {
    await request(app.getHttpServer())
      .post(`/api/matters/${matterId}/messages`)
      .set(bearer(clientToken))
      .send({ body: 'Hola, ¿cómo va mi caso?' })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get(`/api/matters/${matterId}/messages`)
      .set(bearer(adminToken))
      .expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    expect(list.body[0].body).toContain('mi caso');
  });

  it('el cliente NO puede escribir en un expediente ajeno (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/matters/${otherMatterId}/messages`)
      .set(bearer(clientToken))
      .send({ body: 'intruso' })
      .expect(403);
  });

  // ── Realtime ──────────────────────────────────────────────────────────────
  it('el abogado recibe una notificación en tiempo real al asignársele una tarea', async () => {
    const socket: Socket = io(baseUrl, { auth: { token: lawyerToken }, transports: ['websocket'] });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
        setTimeout(() => reject(new Error('timeout de conexión')), 4000);
      });

      const received = new Promise<{ type: string }>((resolve, reject) => {
        socket.on('notification:new', (n: { type: string }) => resolve(n));
        setTimeout(() => reject(new Error('no llegó la notificación')), 5000);
      });

      await request(app.getHttpServer())
        .post('/api/tasks')
        .set(bearer(adminToken))
        .send({ title: 'Revisar escrito', assigneeId: lawyerUserId })
        .expect(201);

      const notification = await received;
      expect(notification.type).toBe('task.assigned');
    } finally {
      socket.disconnect();
    }
  }, 15000);
});
