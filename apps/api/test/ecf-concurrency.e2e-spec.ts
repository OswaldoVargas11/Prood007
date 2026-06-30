import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line import/first
import { AppModule } from '../src/app.module';
// eslint-disable-next-line import/first
import { SystemPrismaService } from '../src/prisma/prisma.service';

/**
 * H-2 (CWE-840 · pentest jun-26) — NO-REUSO DEL CONTADOR eNCF BAJO CONCURRENCIA.
 *
 * El número fiscal de un e-CF (RD) sale de un RANGO AUTORIZADO por la DGII (`EcfSequence.next`).
 * La emisión hace un read-modify-write sobre `next`, así que sin serialización dos emisiones
 * simultáneas leerían el MISMO `next` y emitirían el MISMO eNCF (factura fiscal duplicada — rompe la
 * inmutabilidad fiscal). La protección es `pg_advisory_xact_lock(2, hashtext(tenantId))` en
 * `LedgerService.emitInvoiceInTx`, que serializa la emisión por despacho.
 *
 * Esta prueba dispara N emisiones e-CF EN PARALELO contra el mismo despacho y exige que los eNCF
 * asignados sean únicos, consecutivos y sin huecos. Si el advisory lock se quitara, el test fallaría
 * con eNCF duplicados (o un P2002 por el `@@unique([tenantId, number])`). Corre en CI contra el
 * Postgres real del job `api-integration`, donde el lock existe de verdad.
 */
describe('eNCF allocation under concurrency (no reuse) — H-2 (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';
  const N = 8;

  let token = '';
  let matterId = '';

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
        tenantName: `Despacho encf-conc ${unique}`,
        jurisdiction: 'es',
        currency: 'EUR',
        taxId: 'B12345674',
        admin: { email: `encf_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    token = reg.body.tokens.accessToken;

    // Rango eNCF autorizado por la DGII para crédito fiscal (tipo 31): arranca en 1.
    await request(app.getHttpServer())
      .post('/api/dgii/ecf-sequences')
      .set({ Authorization: `Bearer ${token}` })
      .send({ ncfType: '31', rangeStart: 1, rangeEnd: 1000 })
      .expect(201);

    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Cliente RD', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Asunto RD', type: 'civil', clientId: client.body.id })
      .expect(201);
    matterId = matter.body.id;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `encf-conc ${unique}` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const emitEcf = () =>
    request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth())
      .send({
        matterId,
        currency: 'USD',
        invoiceFormat: 'do',
        lines: [{ description: 'Fees', quantity: '1', unitPrice: '200', taxCode: 'ITBIS_STANDARD' }],
      });

  it(`asigna ${N} eNCF únicos y consecutivos bajo emisión concurrente (sin reuso)`, async () => {
    const responses = await Promise.all(Array.from({ length: N }, () => emitEcf()));

    // Toda emisión debe haber tenido éxito (ninguna cae por P2002/colisión del contador).
    for (const res of responses) {
      expect(res.status).toBe(201);
      expect(res.body.invoice.complianceFormat).toBe('ECF');
    }

    const numbers = responses.map((r) => r.body.invoice.number as string);

    // 1) Todos son eNCF (E + tipo 31 + 10 dígitos).
    for (const n of numbers) expect(n).toMatch(/^E31\d{10}$/);

    // 2) Sin reuso: N emisiones → N números DISTINTOS.
    expect(new Set(numbers).size).toBe(N);

    // 3) Consecutivos y sin huecos desde el inicio del rango (1..N), pase lo que pase con el orden.
    const expected = Array.from(
      { length: N },
      (_, i) => `E31${String(i + 1).padStart(10, '0')}`,
    );
    expect([...numbers].sort()).toEqual(expected);

    // 4) El contador del rango avanzó EXACTAMENTE en N (next = 1 + N), sin dobles consumos.
    const seqs = await request(app.getHttpServer())
      .get('/api/dgii/ecf-sequences')
      .set(auth())
      .expect(200);
    const seq31 = seqs.body.find((s: { ncfType: string }) => s.ncfType === '31');
    expect(seq31.next).toBe(1 + N);
  });
});
