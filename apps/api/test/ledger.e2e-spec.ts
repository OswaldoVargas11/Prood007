import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService, SystemPrismaService } from '../src/prisma/prisma.service';

describe('Ledger & invoicing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  let tenantId = '';
  let token = '';
  let matterId = '';
  let firstInvoiceHash = '';

  // Tenant sin taxId (para probar el rechazo de factura) y tenant B (aislamiento).
  let noTaxToken = '';
  let noTaxMatterId = '';
  let tenantBId = '';
  let tokenB = '';

  async function setup(email: string, withTaxId: boolean) {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: `Despacho ${email}`,
        jurisdiction: 'es',
        currency: 'EUR',
        ...(withTaxId ? { taxId: 'B12345674' } : {}),
        admin: { email, password, fullName: 'Admin' },
      })
      .expect(201);
    const t = reg.body.tokens.accessToken as string;
    const client = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${t}` })
      .send({ name: 'Cliente', taxId: '12345678Z' })
      .expect(201);
    const matter = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${t}` })
      .send({ title: 'Asunto', type: 'civil', clientId: client.body.id })
      .expect(201);
    return { tenantId: reg.body.tenantId as string, token: t, matterId: matter.body.id as string };
  }

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

    const main = await setup(`ledger_${unique}@d.test`, true);
    tenantId = main.tenantId;
    token = main.token;
    matterId = main.matterId;

    const noTax = await setup(`notax_${unique}@d.test`, false);
    noTaxToken = noTax.token;
    noTaxMatterId = noTax.matterId;

    const b = await setup(`ledgerb_${unique}@d.test`, true);
    tenantBId = b.tenantId;
    tokenB = b.token;
  });

  afterAll(async () => {
    const ids = await system.tenant.findMany({
      where: { name: { contains: `_${unique}@d.test` } },
      select: { id: true },
    });
    for (const { id } of ids) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    void tenantId;
    void tenantBId;
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('provisión de fondos suma al saldo', async () => {
    await request(app.getHttpServer())
      .post('/api/ledger/entries')
      .set(auth(token))
      .send({ matterId, type: 'PROVISION', amount: '1000.00', description: 'Provisión inicial' })
      .expect(201);
    const led = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    expect(led.body.balance).toBe('1000.00');
  });

  it('una hora con tarifa genera un TIME_FEE que resta del saldo', async () => {
    await request(app.getHttpServer())
      .post('/api/ledger/time')
      .set(auth(token))
      .send({
        matterId,
        description: 'Estudio',
        minutes: 60,
        hourlyRate: '120.00',
        workedAt: '2026-02-01',
      })
      .expect(201);
    const led = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    expect(led.body.balance).toBe('880.00'); // 1000 − 120
  });

  it('emite una factura ES con IVA 21% e IRPF 15% y registro Verifactu', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        withholdingTaxCode: 'IRPF_GENERAL',
        lines: [
          { description: 'Honorarios', quantity: '10', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    expect(Number(res.body.invoice.total)).toBe(1060); // 1000 + 210 − 150
    expect(res.body.invoice.complianceFormat).toBe('VERIFACTU');
    expect(res.body.compliance.recordHash).toMatch(/^[a-f0-9]{64}$/);
    firstInvoiceHash = res.body.compliance.recordHash;
  });

  it('el preview fiscal devuelve los mismos totales que la emisión real (sin crear factura)', async () => {
    // El preview solo necesita cantidad · precio · código (la descripción no entra en la matemática).
    const lines = [{ quantity: '10', unitPrice: '100', taxCode: 'IVA_STANDARD' }];
    const before = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    const invoicesBefore = before.body.entries.filter(
      (e: { type: string }) => e.type === 'INVOICE',
    ).length;

    const preview = await request(app.getHttpServer())
      .post('/api/ledger/invoices/preview')
      .set(auth(token))
      .send({ withholdingTaxCode: 'IRPF_GENERAL', lines })
      .expect(201);
    expect(preview.body.format).toBe('VERIFACTU');
    expect(preview.body.totals).toEqual({
      taxableBase: '1000.00',
      taxAmount: '210.00',
      withholdingAmount: '150.00',
      total: '1060.00',
    });

    // Read-only: el preview NO debe haber creado ninguna factura ni apunte.
    const after = await request(app.getHttpServer())
      .get(`/api/ledger/matter/${matterId}`)
      .set(auth(token))
      .expect(200);
    const invoicesAfter = after.body.entries.filter(
      (e: { type: string }) => e.type === 'INVOICE',
    ).length;
    expect(invoicesAfter).toBe(invoicesBefore);
  });

  it('preview con código fiscal inválido responde 400', async () => {
    await request(app.getHttpServer())
      .post('/api/ledger/invoices/preview')
      .set(auth(token))
      .send({ lines: [{ quantity: '1', unitPrice: '100', taxCode: 'NO_EXISTE' }] })
      .expect(400);
  });

  it('la segunda factura encadena con la huella de la primera', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        lines: [
          {
            description: 'Más honorarios',
            quantity: '1',
            unitPrice: '200',
            taxCode: 'IVA_STANDARD',
          },
        ],
      })
      .expect(201);
    expect(res.body.invoice.previousRecordHash).toBe(firstInvoiceHash);
    expect(res.body.compliance.recordHash).not.toBe(firstInvoiceHash);
  });

  it('emitir factura sin identificador fiscal del despacho falla (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(noTaxToken))
      .send({
        matterId: noTaxMatterId,
        lines: [{ description: 'X', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
      })
      .expect(400);
  });

  it('cobrar una factura crea un PAYMENT y la marca PAID', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        lines: [
          { description: 'Honorarios C', quantity: '1', unitPrice: '300', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    const paid = await request(app.getHttpServer())
      .post(`/api/ledger/invoices/${inv.body.invoice.id}/pay`)
      .set(auth(token))
      .expect(201);
    expect(paid.body.status).toBe('PAID');
  });

  it('el despacho descarga el PDF de una factura emitida (application/pdf, %PDF)', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        lines: [
          { description: 'Para PDF', quantity: '2', unitPrice: '150', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${inv.body.invoice.id}/pdf`)
      .set(auth(token))
      .buffer(true)
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res2.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((res.body as Buffer).length).toBeGreaterThan(800);
  });

  it('AISLAMIENTO: el tenant B no ve una factura del tenant A (404)', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        lines: [
          { description: 'Privada', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/ledger/invoices/${inv.body.invoice.id}`)
      .set(auth(tokenB))
      .expect(404);
  });

  // ── Fase 1 · estados ricos + vencimiento ──────────────────────────────────
  it('la factura emitida trae dueDate por defecto (issueDate + 30 días)', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        issueDate: '2026-03-01',
        lines: [{ description: 'V', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    expect(String(inv.body.invoice.dueDate)).toContain('2026-03-31');
  });

  it('cobrar marca amountPaid = total y fija paidAt', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        lines: [{ description: 'Cobro', quantity: '1', unitPrice: '400', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    const paid = await request(app.getHttpServer())
      .post(`/api/ledger/invoices/${inv.body.invoice.id}/pay`)
      .set(auth(token))
      .expect(201);
    expect(paid.body.status).toBe('PAID');
    expect(Number(paid.body.amountPaid)).toBe(Number(inv.body.invoice.total));
    expect(paid.body.paidAt).toBeTruthy();
  });

  it('el listado global devuelve las facturas del despacho con overdue derivado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ledger/invoices')
      .set(auth(token))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const row = res.body[0];
    expect(row).toHaveProperty('number');
    expect(row).toHaveProperty('overdue');
    expect(row).toHaveProperty('total');
  });

  it('una factura con dueDate pasada aparece como vencida (overdue=true)', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        dueDate: '2020-01-01',
        lines: [{ description: 'Old', quantity: '1', unitPrice: '100', taxCode: 'IVA_STANDARD' }],
      })
      .expect(201);
    const overdue = await request(app.getHttpServer())
      .get('/api/ledger/invoices?overdue=true')
      .set(auth(token))
      .expect(200);
    const ids = (overdue.body as { id: string; overdue: boolean }[]).map((i) => i.id);
    expect(ids).toContain(inv.body.invoice.id);
    expect(overdue.body.every((i: { overdue: boolean }) => i.overdue)).toBe(true);
  });

  it('una factura pagada con dueDate pasada NO está vencida', async () => {
    const inv = await request(app.getHttpServer())
      .post('/api/ledger/invoices')
      .set(auth(token))
      .send({
        matterId,
        dueDate: '2020-01-01',
        lines: [
          { description: 'OldPaid', quantity: '1', unitPrice: '50', taxCode: 'IVA_STANDARD' },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/ledger/invoices/${inv.body.invoice.id}/pay`)
      .set(auth(token))
      .expect(201);
    const overdue = await request(app.getHttpServer())
      .get('/api/ledger/invoices?overdue=true')
      .set(auth(token))
      .expect(200);
    const ids = (overdue.body as { id: string }[]).map((i) => i.id);
    expect(ids).not.toContain(inv.body.invoice.id);
  });

  // ── Fase 1 · captura de tiempo sin fricción ───────────────────────────────
  it('lista el tiempo del día del usuario con honorario calculado', async () => {
    // El setup ya fichó 60 min @ 120 el 2026-02-01.
    const res = await request(app.getHttpServer())
      .get('/api/ledger/time?mine=true&date=2026-02-01')
      .set(auth(token))
      .expect(200);
    expect(res.body.totalMinutes).toBe(60);
    expect(res.body.totalFee).toBe('120.00');
    expect(res.body.entries[0].fee).toBe('120.00');
    expect(res.body.entries[0].matter).toHaveProperty('reference');
  });

  it('lista el tiempo sin facturar del despacho', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ledger/time?unbilled=true')
      .set(auth(token))
      .expect(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries.every((e: { billed: boolean }) => e.billed === false)).toBe(true);
  });

  it('AISLAMIENTO: el tenant B no ve el tiempo del tenant A', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ledger/time')
      .set(auth(tokenB))
      .expect(200);
    expect(res.body.entries.length).toBe(0);
  });
});
