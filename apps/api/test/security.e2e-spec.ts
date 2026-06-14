import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Verifica defensas transversales: cabeceras helmet y rate limiting en login. */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const unique = Date.now();
  let tenantId = '';
  const email = `sec_${unique}@d.test`;
  const password = 'Sup3rSecret!2026';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(helmet());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    prisma = app.get(PrismaService);
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Sec ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email, password, fullName: 'Admin' },
      })
      .expect(201);
    tenantId = reg.body.tenantId;
  });

  afterAll(async () => {
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
  });

  it('expone cabeceras de seguridad (helmet)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('aplica rate limiting al login (429 tras superar el límite)', async () => {
    let limited = false;
    // El límite es 10/min; al 11º intento debe responder 429.
    for (let i = 0; i < 12; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'incorrecta', tenantId });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
