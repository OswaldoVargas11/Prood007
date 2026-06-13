import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tasks & procedural deadlines (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  let tenantId = '';
  let token = '';
  let matterId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: 'Despacho Tasks',
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `tasks_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
    token = reg.body.tokens.accessToken;

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Cliente Task', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Asunto Task', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('crea una tarea simple vinculada a un expediente', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'Llamar al cliente', matterId })
      .expect(201);
    expect(res.body.status).toBe('TODO');
    expect(res.body.isProcedural).toBe(false);
  });

  it('crea una tarea desde un plazo procesal (fecha límite calculada por el provider ES)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks/from-deadline')
      .set(auth())
      .send({ deadlineType: 'APELACION', startDate: '2025-12-23', days: 3, matterId })
      .expect(201);
    // 2025-12-23 + 3 hábiles con Navidad (25) → 2025-12-29.
    expect(res.body.deadline.dueDate).toBe('2025-12-29');
    expect(res.body.deadline.holidaysApplied).toContain('2025-12-25');
    expect(res.body.task.isProcedural).toBe(true);
    expect(res.body.task.deadlineType).toBe('APELACION');
  });

  it('lista tareas del expediente (incluye la simple y la procesal)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tasks')
      .query({ matterId })
      .set(auth())
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('actualiza el estado de una tarea a DONE', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'Preparar escrito' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .patch(`/api/tasks/${created.body.id}`)
      .set(auth())
      .send({ status: 'DONE' })
      .expect(200);
    expect(res.body.status).toBe('DONE');
  });

  it('rechaza un expediente inexistente al crear tarea (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set(auth())
      .send({ title: 'X', matterId: 'inexistente' })
      .expect(400);
  });
});
