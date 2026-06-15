import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de Clientes + Expedientes (E2): validación fiscal por jurisdicción, máquina de estados y
 * AISLAMIENTO POR TENANT (un despacho nunca ve ni usa datos de otro).
 */
describe('Clients & Matters (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = Date.now();

  // Dos despachos para probar aislamiento.
  const tenants: Record<'a' | 'b', { tenantId: string; token: string; email: string }> = {
    a: { tenantId: '', token: '', email: `a_${unique}@d.test` },
    b: { tenantId: '', token: '', email: `b_${unique}@d.test` },
  };
  const password = 'Sup3rSecret!2026';

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
    await app.init();

    Object.assign(tenants.a, await registerTenant(tenants.a.email));
    Object.assign(tenants.b, await registerTenant(tenants.b.email));

    // Letrado (rol LAWYER, no admin) en el tenant A, para probar permisos de asignación.
    const lawyerRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenants.a.tenantId, code: 'LAWYER' },
    });
    const lawyerEmail = `lawyer_${unique}@d.test`;
    const lawyer = await prisma.user.create({
      data: {
        tenantId: tenants.a.tenantId,
        email: lawyerEmail,
        passwordHash: await argon2.hash(password),
        fullName: 'Letrada A',
        roles: { create: [{ roleId: lawyerRole.id }] },
      },
    });
    lawyerAUserId = lawyer.id;
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password, tenantId: tenants.a.tenantId })
      .expect(200);
    lawyerAToken = login.body.accessToken;
  });

  afterAll(async () => {
    for (const t of [tenants.a, tenants.b]) {
      if (t.tenantId)
        await prisma.tenant.delete({ where: { id: t.tenantId } }).catch(() => undefined);
    }
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  let clientAId = '';
  let matterAId = '';
  let lawyerAToken = '';
  let lawyerAUserId = '';

  it('crea un cliente con NIF válido (normalizado por el provider ES)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(tenants.a.token))
      .send({ name: 'Cliente A', taxId: '12345678-z' })
      .expect(201);
    expect(res.body.taxId).toBe('12345678Z');
    expect(res.body.taxIdKind).toBe('NIF');
    clientAId = res.body.id;
  });

  it('rechaza un cliente con identificador fiscal inválido (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(tenants.a.token))
      .send({ name: 'Malo', taxId: 'XXX' })
      .expect(400);
  });

  it('sin token no se puede crear cliente (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/clients')
      .send({ name: 'X', taxId: '12345678Z' })
      .expect(401);
  });

  it('AISLAMIENTO: el tenant B no ve el cliente del tenant A (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/clients/${clientAId}`)
      .set(auth(tenants.b.token))
      .expect(404);
  });

  it('crea un expediente con referencia autogenerada', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(tenants.a.token))
      .send({ title: 'Reclamación', type: 'civil', clientId: clientAId })
      .expect(201);
    expect(res.body.reference).toMatch(/^EXP-\d{4}-\d{4}$/);
    expect(res.body.status).toBe('OPEN');
    matterAId = res.body.id;
  });

  it('AISLAMIENTO: el tenant B no puede crear expediente con el cliente del tenant A (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(tenants.b.token))
      .send({ title: 'Intruso', type: 'civil', clientId: clientAId })
      .expect(400);
  });

  it('transición de estado válida OPEN → IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/status`)
      .set(auth(tenants.a.token))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('transición de estado inválida IN_PROGRESS → ARCHIVED (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/status`)
      .set(auth(tenants.a.token))
      .send({ status: 'ARCHIVED' })
      .expect(400);
  });

  it('el admin lista los letrados asignables del despacho', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/matters/assignees')
      .set(auth(tenants.a.token))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.map((u: { id: string }) => u.id)).toContain(lawyerAUserId);
  });

  it('un letrado (no admin) NO puede listar asignables (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/matters/assignees')
      .set(auth(lawyerAToken))
      .expect(403);
  });

  it('el admin asigna el letrado responsable del expediente', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/lawyer`)
      .set(auth(tenants.a.token))
      .send({ lawyerId: lawyerAUserId })
      .expect(200);
    expect(res.body.lawyerId).toBe(lawyerAUserId);
    expect(res.body.lawyer?.fullName).toBe('Letrada A');
  });

  it('GET /matters/:id incluye el letrado responsable', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/matters/${matterAId}`)
      .set(auth(tenants.a.token))
      .expect(200);
    expect(res.body.lawyer?.id).toBe(lawyerAUserId);
  });

  it('un letrado (no admin) NO puede asignar (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/lawyer`)
      .set(auth(lawyerAToken))
      .send({ lawyerId: lawyerAUserId })
      .expect(403);
  });

  it('no se puede asignar un usuario inexistente como letrado (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/lawyer`)
      .set(auth(tenants.a.token))
      .send({ lawyerId: 'no-existe' })
      .expect(400);
  });

  it('el admin puede desasignar el letrado (lawyerId: null)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/matters/${matterAId}/lawyer`)
      .set(auth(tenants.a.token))
      .send({ lawyerId: null })
      .expect(200);
    expect(res.body.lawyerId).toBeNull();
    expect(res.body.lawyer).toBeNull();
  });

  it('un letrado (no admin) NO puede crear expediente con letrado asignado (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(lawyerAToken))
      .send({ title: 'Sin permiso', type: 'civil', clientId: clientAId, lawyerId: lawyerAUserId })
      .expect(403);
  });

  it('registra auditoría de la creación del cliente y el expediente', async () => {
    const logs = await prisma.auditLog.findMany({ where: { tenantId: tenants.a.tenantId } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('client.created');
    expect(actions).toContain('matter.created');
    expect(actions).toContain('matter.status_changed');
  });
});
