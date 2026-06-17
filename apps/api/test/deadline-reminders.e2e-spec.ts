import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * E2E del avisador de plazos próximos: una tarea con dueDate dentro de la ventana genera notificación
 * al ejecutar el barrido, y un segundo barrido NO duplica (deduplicación por tarea/fecha/ventana).
 */
describe('Deadline reminders (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let tenantId = '';
  let token = '';
  let adminId = '';
  let matterId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    app.get(PrismaService);
    system = app.get(SystemPrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Plazos',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `plazos_${unique}@d.test`, password, fullName: 'Admin Plazos' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    adminId = me.body.userId;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Cliente Plazos', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Asunto Plazos', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    if (tenantId) await system.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('avisa de un plazo próximo y un segundo barrido no duplica', async () => {
    const dueDate = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'Presentar escrito de contestación', matterId, assigneeId: adminId, dueDate })
      .expect(201);

    // Primer barrido: avisa al menos una vez.
    const first = await request(app.getHttpServer())
      .post('/api/tasks/run-reminders')
      .set(auth())
      .expect(201);
    expect(first.body.reminded).toBeGreaterThanOrEqual(1);

    // Se creó la notificación in-app del plazo.
    const notifs = await request(app.getHttpServer())
      .get('/api/notifications')
      .set(auth())
      .expect(200);
    const list = Array.isArray(notifs.body) ? notifs.body : (notifs.body.items ?? []);
    expect(list.some((n: { type: string }) => n.type === 'task.deadline_due_soon')).toBe(true);

    // Segundo barrido: deduplica (no vuelve a avisar la misma tarea/ventana).
    const second = await request(app.getHttpServer())
      .post('/api/tasks/run-reminders')
      .set(auth())
      .expect(201);
    expect(second.body.reminded).toBe(0);
    expect(second.body.skipped).toBeGreaterThanOrEqual(1);
  });

  it('run-reminders exige rol admin (sin token → 401)', async () => {
    await request(app.getHttpServer()).post('/api/tasks/run-reminders').expect(401);
  });
});
