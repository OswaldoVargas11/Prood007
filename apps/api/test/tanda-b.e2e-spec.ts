import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de la Tanda B: gestión de usuarios del despacho con LICENCIA de plazas, ajustes, auditoría
 * (listado) y aprobación de costes. Cubre los flujos de admin y letrado y el aislamiento por rol.
 */
describe('Tanda B — usuarios/licencia, ajustes, auditoría, aprobaciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let adminToken = '';
  const adminEmail = `admin_${unique}@d.test`;
  const lawyerEmail = `lawyer_${unique}@d.test`;
  let lawyerToken = '';
  let lawyerId = '';
  let clientId = '';
  let matterId = '';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${adminEmail}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: adminEmail, password, fullName: 'Admin Jefe' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    adminToken = reg.body.tokens.accessToken;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  // ── Usuarios + licencia ────────────────────────────────────────────────
  it('el admin ve el staff (solo él) y las plazas (1/2 admins, 0/5 letrados)', async () => {
    const staff = await request(app.getHttpServer())
      .get('/api/users')
      .set(auth(adminToken))
      .expect(200);
    expect(staff.body).toHaveLength(1);
    expect(staff.body[0].role).toBe('FIRM_ADMIN');
    expect(staff.body[0].isSelf).toBe(true);

    const seats = await request(app.getHttpServer())
      .get('/api/users/seats')
      .set(auth(adminToken))
      .expect(200);
    expect(seats.body).toEqual({
      admins: { used: 1, max: 2 },
      lawyers: { used: 0, max: 5 },
    });
  });

  it('el admin da de alta un letrado y ese letrado puede iniciar sesión', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(adminToken))
      .send({ email: lawyerEmail, fullName: 'Laura Letrada', password, role: 'LAWYER' })
      .expect(201);
    lawyerId = created.body.id;
    expect(created.body.role).toBe('LAWYER');

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password })
      .expect(200);
    lawyerToken = login.body.accessToken;
    expect(lawyerToken).toBeTruthy();
  });

  it('un letrado NO puede gestionar usuarios ni ver ajustes/auditoría (403)', async () => {
    await request(app.getHttpServer()).get('/api/users').set(auth(lawyerToken)).expect(403);
    await request(app.getHttpServer()).get('/api/settings').set(auth(lawyerToken)).expect(403);
    await request(app.getHttpServer()).get('/api/audit').set(auth(lawyerToken)).expect(403);
    await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(lawyerToken))
      .send({ email: `x_${unique}@d.test`, fullName: 'X', password, role: 'LAWYER' })
      .expect(403);
  });

  it('respeta la LICENCIA: con maxLawyers=1 no se puede crear un segundo letrado (403)', async () => {
    await system.tenant.update({ where: { id: tenantId }, data: { maxLawyers: 1 } });
    await request(app.getHttpServer())
      .post('/api/users')
      .set(auth(adminToken))
      .send({ email: `lawyer2_${unique}@d.test`, fullName: 'Otro', password, role: 'LAWYER' })
      .expect(403);
    // Restaura para no afectar otras pruebas.
    await system.tenant.update({ where: { id: tenantId }, data: { maxLawyers: 5 } });
  });

  it('no permite dejar el despacho sin administrador activo (400 al desactivarse el único admin)', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/users')
      .set(auth(adminToken))
      .expect(200);
    const adminRow = me.body.find((u: { isSelf: boolean }) => u.isSelf);
    await request(app.getHttpServer())
      .patch(`/api/users/${adminRow.id}`)
      .set(auth(adminToken))
      .send({ isActive: false })
      .expect(400);
  });

  it('desactiva un letrado y este ya no puede iniciar sesión (401)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/users/${lawyerId}`)
      .set(auth(adminToken))
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password })
      .expect(401);
    // Reactiva para las pruebas de aprobación.
    await request(app.getHttpServer())
      .patch(`/api/users/${lawyerId}`)
      .set(auth(adminToken))
      .send({ isActive: true })
      .expect(200);
    const relogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: lawyerEmail, password })
      .expect(200);
    lawyerToken = relogin.body.accessToken;
  });

  // ── Ajustes ──────────────────────────────────────────────────────────────
  it('el admin lee y actualiza los ajustes del despacho', async () => {
    const get = await request(app.getHttpServer())
      .get('/api/settings')
      .set(auth(adminToken))
      .expect(200);
    expect(get.body.tenant.plan).toBe('Profesional');
    expect(get.body.seats.admins.used).toBe(1);

    const patched = await request(app.getHttpServer())
      .patch('/api/settings')
      .set(auth(adminToken))
      .send({ name: 'Bufete Renombrado' })
      .expect(200);
    expect(patched.body.tenant.name).toBe('Bufete Renombrado');
  });

  // ── Aprobación de costes ───────────────────────────────────────────────
  it('prepara un cliente y un expediente', async () => {
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth(adminToken))
      .send({ name: 'Cliente Aprob', taxId: '12345678Z' })
      .expect(201);
    clientId = c.body.id;
    const m = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth(adminToken))
      .send({ title: 'Asunto', type: 'civil', clientId })
      .expect(201);
    matterId = m.body.id;
  });

  let proposedId = '';
  it('un letrado propone un coste; no afecta al saldo hasta aprobarse', async () => {
    const prop = await request(app.getHttpServer())
      .post('/api/ledger/costs/propose')
      .set(auth(lawyerToken))
      .send({ matterId, description: 'Tasas judiciales', amount: '100.00' })
      .expect(201);
    proposedId = prop.body.id;
    expect(prop.body.approvalStatus).toBe('PROPOSED');

    const ledger = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(ledger.body.balance).toBe('0.00'); // propuesto no mueve saldo
  });

  it('el letrado NO puede aprobar; el admin sí, y entonces el saldo refleja el coste', async () => {
    await request(app.getHttpServer())
      .post(`/api/ledger/approvals/${proposedId}/approve`)
      .set(auth(lawyerToken))
      .expect(403);

    const approvals = await request(app.getHttpServer())
      .get('/api/ledger/approvals')
      .set(auth(adminToken))
      .expect(200);
    expect(approvals.body).toHaveLength(1);
    expect(approvals.body[0].id).toBe(proposedId);

    await request(app.getHttpServer())
      .post(`/api/ledger/approvals/${proposedId}/approve`)
      .set(auth(adminToken))
      .expect(201);

    const ledger = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(ledger.body.balance).toBe('-100.00'); // suplido aprobado resta saldo
  });

  it('un coste con justificante adjunto se guarda (hasReceipt) y se puede descargar', async () => {
    const prop = await request(app.getHttpServer())
      .post('/api/ledger/costs/propose')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('description', 'Tasa con ticket')
      .field('amount', '50.00')
      .attach('receipt', Buffer.from('datos-del-ticket'), 'ticket.png')
      .expect(201);
    const id = prop.body.id;

    const ledger = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    const entry = ledger.body.entries.find((e: { id: string }) => e.id === id);
    expect(entry.hasReceipt).toBe(true);
    expect(entry.receiptKey).toBeUndefined(); // la clave de almacenamiento NO se expone

    const receipt = await request(app.getHttpServer())
      .get(`/api/ledger/costs/${id}/receipt`)
      .set(auth(adminToken))
      .expect(200);
    expect(receipt.headers['content-type']).toContain('image/png');
  });

  it('rechaza un justificante que no es imagen/PDF (anti stored-XSS, 400)', async () => {
    await request(app.getHttpServer())
      .post('/api/ledger/costs/propose')
      .set(auth(lawyerToken))
      .field('matterId', matterId)
      .field('description', 'Con HTML')
      .field('amount', '5.00')
      .attach('receipt', Buffer.from('<script>alert(1)</script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      })
      .expect(400);
  });

  it('rechazar un coste propuesto no afecta al saldo', async () => {
    const prop = await request(app.getHttpServer())
      .post('/api/ledger/costs/propose')
      .set(auth(lawyerToken))
      .send({ matterId, description: 'Gasto dudoso', amount: '50.00' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/ledger/approvals/${prop.body.id}/reject`)
      .set(auth(adminToken))
      .send({ note: 'No procede' })
      .expect(201);
    const ledger = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(ledger.body.balance).toBe('-100.00'); // sigue igual
  });

  // ── Auditoría ──────────────────────────────────────────────────────────
  it('el registro de auditoría incluye las acciones de la Tanda B', async () => {
    const audit = await request(app.getHttpServer())
      .get('/api/audit?pageSize=100')
      .set(auth(adminToken))
      .expect(200);
    const actions = audit.body.items.map((i: { action: string }) => i.action);
    expect(actions).toContain('user.created');
    expect(actions).toContain('cost.proposed');
    expect(actions).toContain('cost.approved');
    expect(actions).toContain('cost.rejected');
    expect(actions).toContain('tenant.updated');
    expect(audit.body.items[0].actorName).toBeTruthy();
  });
});
