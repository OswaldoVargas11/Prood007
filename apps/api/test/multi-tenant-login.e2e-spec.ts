import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * MISMA PERSONA EN VARIOS DESPACHOS. El mismo email puede existir en N tenants (User es
 * @@unique([tenantId, email])). El login resuelve el despacho por CONTRASEÑA en vez de exigir un
 * tenantId a ciegas:
 *   - contraseñas distintas por despacho → entra al que coincide (resolución automática);
 *   - misma contraseña en varios          → 409 auth.chooseTenant con la lista para elegir;
 *   - elegir despacho (tenantId)          → entra a ese.
 * Verifica además que el ALTA del usuario en el segundo despacho no se bloquea por existir el email
 * en el primero (registro cross-tenant correcto).
 */
describe('Multi-tenant login resolution (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const adminPass = 'Sup3rSecret!2026';

  let tenantA = '';
  let tenantB = '';
  let tokenA = '';
  let tokenB = '';

  async function registerTenant(suffix: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${suffix}`,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `admin_${suffix}@d.test`, password: adminPass, fullName: 'Admin' },
      })
      .expect(201);
    return { tenantId: res.body.tenantId as string, token: res.body.tokens.accessToken as string };
  }

  async function createLawyer(token: string, email: string, password: string) {
    return request(app.getHttpServer())
      .post('/api/users')
      .set({ Authorization: `Bearer ${token}` })
      .send({ email, password, fullName: 'Persona Compartida', role: 'LAWYER' })
      .expect(201);
  }

  const tidOf = (accessToken: string): string =>
    JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString()).tid;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await registerTenant(`a_${unique}`);
    const b = await registerTenant(`b_${unique}`);
    tenantA = a.tenantId;
    tenantB = b.tenantId;
    tokenA = a.token;
    tokenB = b.token;
  });

  afterAll(async () => {
    for (const id of [tenantA, tenantB]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const login = (email: string, password: string, tenantId?: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password, ...(tenantId ? { tenantId } : {}) });

  it('permite dar de alta el MISMO email en un segundo despacho (registro cross-tenant)', async () => {
    const email = `diff_${unique}@cliente.test`;
    await createLawyer(tokenA, email, 'PasswordParaA1!');
    // No debe fallar por existir el email en el despacho A: el alta está scoped por tenant.
    await createLawyer(tokenB, email, 'PasswordParaB2!');
  });

  it('con contraseñas distintas, el login resuelve el despacho correcto sin tenantId', async () => {
    const email = `diff_${unique}@cliente.test`;
    const resA = await login(email, 'PasswordParaA1!').expect(200);
    expect(tidOf(resA.body.accessToken)).toBe(tenantA);
    const resB = await login(email, 'PasswordParaB2!').expect(200);
    expect(tidOf(resB.body.accessToken)).toBe(tenantB);
  });

  it('con contraseña incorrecta en todos los despachos → 401', async () => {
    const email = `diff_${unique}@cliente.test`;
    await login(email, 'NoEsLaClave99!').expect(401);
  });

  it('con la MISMA contraseña en varios despachos → 409 con la lista para elegir', async () => {
    const email = `same_${unique}@cliente.test`;
    const shared = 'ClaveCompartida9!';
    await createLawyer(tokenA, email, shared);
    await createLawyer(tokenB, email, shared);

    const res = await login(email, shared).expect(409);
    expect(res.body.code).toBe('auth.chooseTenant');
    expect(res.body.choices).toHaveLength(2);
    const ids = res.body.choices.map((c: { tenantId: string }) => c.tenantId).sort();
    expect(ids).toEqual([tenantA, tenantB].sort());

    // Eligiendo el despacho explícitamente, entra a ese.
    const chosen = await login(email, shared, tenantB).expect(200);
    expect(tidOf(chosen.body.accessToken)).toBe(tenantB);
  });
});
