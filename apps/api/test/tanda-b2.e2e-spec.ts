import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// Fuerza almacenamiento en disco local para la subida del certificado (MinIO no es necesario).
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_PATH = join(tmpdir(), `legalflow-cert-${Date.now()}`);

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * E2E de la Tanda B (resto): comprobación de conflictos, serie fiscal en la numeración de facturas,
 * festivos locales en el cómputo de plazos y subida de certificado.
 */
describe('Tanda B (resto) — conflictos, serie fiscal, festivos, certificado (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let tenantId = '';
  let token = '';
  let clientId = '';
  let matterId = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

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
        tenantName: `Resto ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `admin_${unique}@r.test`, fullName: 'Admin', password },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;

    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set(auth())
      .send({ name: 'Inmobiliaria Costa Brava S.A.', taxId: '12345678Z' })
      .expect(201);
    clientId = c.body.id;
    const m = await request(app.getHttpServer())
      .post('/api/matters')
      .set(auth())
      .send({ title: 'Asunto', type: 'civil', clientId })
      .expect(201);
    matterId = m.body.id;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  // ── Conflictos ───────────────────────────────────────────────────────────
  it('la comprobación de conflictos encuentra a la parte por nombre', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clients/conflict-check?q=costa brava')
      .set(auth())
      .expect(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].name).toContain('Costa Brava');
    expect(res.body.matches[0].matters).toHaveLength(1);
  });

  it('una búsqueda demasiado corta no devuelve coincidencias', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/clients/conflict-check?q=c')
      .set(auth())
      .expect(200);
    expect(res.body.matches).toHaveLength(0);
  });

  // ── Serie fiscal ───────────────────────────────────────────────────────────
  it('la serie fiscal configurada se usa en el número de factura', async () => {
    await request(app.getHttpServer())
      .patch('/api/settings')
      .set(auth())
      .send({ invoiceSeries: 'A' })
      .expect(200);
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth())
      .send({
        matterId,
        lines: [
          { description: 'Honorarios', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    expect(inv.body.invoice.number).toMatch(/^A-\d{4}-\d{4}$/);
  });

  // ── Festivos locales ───────────────────────────────────────────────────────
  it('un festivo local del despacho desplaza el cómputo del plazo', async () => {
    // 1) Plazo natural (sin festivo local): obtenemos la fecha de vencimiento.
    const first = await request(app.getHttpServer())
      .post('/api/tasks/from-deadline')
      .set(auth())
      .send({ deadlineType: 'TEST', startDate: '2026-07-06', days: 1 })
      .expect(201);
    const naturalDue: string = first.body.deadline.dueDate;

    // 2) Declaramos ese día como festivo local.
    const add = await request(app.getHttpServer())
      .post('/api/settings/holidays')
      .set(auth())
      .send({ date: naturalDue, name: 'Festivo de prueba' })
      .expect(201);
    expect(add.body.holidays.some((h: { date: string }) => h.date === naturalDue)).toBe(true);

    // 3) Mismo plazo: ahora salta el festivo y vence más tarde.
    const second = await request(app.getHttpServer())
      .post('/api/tasks/from-deadline')
      .set(auth())
      .send({ deadlineType: 'TEST', startDate: '2026-07-06', days: 1 })
      .expect(201);
    expect(second.body.deadline.dueDate > naturalDue).toBe(true);
    expect(second.body.deadline.holidaysApplied).toContain(naturalDue);

    // 4) Se puede eliminar el festivo.
    const del = await request(app.getHttpServer())
      .delete(`/api/settings/holidays/${naturalDue}`)
      .set(auth())
      .expect(200);
    expect(del.body.holidays.some((h: { date: string }) => h.date === naturalDue)).toBe(false);
  });

  // ── Certificado ─────────────────────────────────────────────────────────────
  it('se puede subir el certificado del despacho y queda registrado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/settings/certificate')
      .set(auth())
      .attach('file', Buffer.from('fake-cert-bytes'), 'certificado.p12')
      .expect(201);
    expect(res.body.certificate?.name).toBe('certificado.p12');
    expect(res.body.certificate?.uploadedAt).toBeTruthy();
  });
});
