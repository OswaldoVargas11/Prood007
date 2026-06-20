import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SystemPrismaService } from '../src/prisma/prisma.service';
import { renderTemplate } from '../src/templates/render';

/**
 * E2E de plantillas de documento: CRUD, generación con sustitución de campos combinados en el
 * expediente, y aislamiento por tenant (RLS) — un despacho no ve/usa las plantillas de otro.
 */
describe('Document templates (e2e)', () => {
  let app: INestApplication;
  let system: SystemPrismaService;
  const unique = Date.now();
  const password = 'Sup3rSecret!2026';

  // Tenant A
  let tenantA = '';
  let tokenA = '';
  let matterA = '';
  let templateA = '';
  // Tenant B (para aislamiento)
  let tenantB = '';
  let tokenB = '';
  let matterB = '';

  const reg = async (suffix: string, name: string) => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/register-tenant')
      .send({
        tenantName: name,
        jurisdiction: 'es',
        currency: 'EUR',
        admin: { email: `tpl_${suffix}_${unique}@d.test`, password, fullName: 'Admin' },
      })
      .expect(201);
    return { tenantId: r.body.tenantId as string, token: r.body.tokens.accessToken as string };
  };
  const mkMatter = async (token: string) => {
    const c = await request(app.getHttpServer())
      .post('/api/clients')
      .set({ Authorization: `Bearer ${token}` })
      .send({ name: 'Construcciones Demo SL', taxId: '12345678Z' })
      .expect(201);
    const m = await request(app.getHttpServer())
      .post('/api/matters')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Reclamación', type: 'civil', clientId: c.body.id })
      .expect(201);
    return { client: c.body, matter: m.body };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    system = app.get(SystemPrismaService);
    await app.init();

    const a = await reg('a', 'Despacho A');
    tenantA = a.tenantId;
    tokenA = a.token;
    const b = await reg('b', 'Despacho B');
    tenantB = b.tenantId;
    tokenB = b.token;
    matterA = (await mkMatter(tokenA)).matter.id;
    matterB = (await mkMatter(tokenB)).matter.id;
  });

  afterAll(async () => {
    for (const id of [tenantA, tenantB]) {
      if (id) await system.tenant.delete({ where: { id } }).catch(() => undefined);
    }
    await app.close();
  });

  const A = () => ({ Authorization: `Bearer ${tokenA}` });
  const B = () => ({ Authorization: `Bearer ${tokenB}` });

  it('crea una plantilla y expone sus marcadores', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/templates')
      .set(A())
      .send({
        name: 'Carta de reclamación',
        body: 'Estimado/a {{cliente.nombre}}, sobre el expediente {{expediente.referencia}} ({{despacho.nombre}}, {{fecha}}).',
      })
      .expect(201);
    templateA = res.body.id;
    const list = await request(app.getHttpServer()).get('/api/templates').set(A()).expect(200);
    const found = list.body.find((t: { id: string }) => t.id === templateA);
    expect(found).toBeDefined();
    expect(found.tokens).toEqual(
      expect.arrayContaining([
        'cliente.nombre',
        'expediente.referencia',
        'despacho.nombre',
        'fecha',
      ]),
    );
  });

  it('genera un documento (PDF con membrete) en el expediente', async () => {
    const gen = await request(app.getHttpServer())
      .post('/api/documents/from-template')
      .set(A())
      .send({ templateId: templateA, matterId: matterA })
      .expect(201);
    expect(gen.body.document.id).toBeDefined();
    const versionId = gen.body.version.id;

    const dl = await request(app.getHttpServer())
      .get(`/api/documents/versions/${versionId}/download`)
      .set(A())
      .expect(200);
    // El documento se entrega como PDF (no HTML pelado): cabecera %PDF y tamaño no trivial.
    const out = dl.text || dl.body.toString();
    expect(out.slice(0, 4)).toBe('%PDF');
    expect(out.length).toBeGreaterThan(500);
  });

  it('renderTemplate sustituye los marcadores y no deja {{ }} sin resolver', () => {
    const rendered = renderTemplate(
      'Estimado {{cliente.nombre}}, exp. {{expediente.referencia}} de {{despacho.nombre}}. {{desconocido}}',
      {
        'cliente.nombre': 'Construcciones Demo SL',
        'expediente.referencia': 'EXP-1',
        'despacho.nombre': 'Despacho A',
      },
    );
    expect(rendered).toContain('Construcciones Demo SL');
    expect(rendered).toContain('Despacho A');
    // Un marcador desconocido se sustituye por cadena vacía, sin dejar el `{{...}}`.
    expect(rendered).not.toContain('{{');
  });

  it('aislamiento: el despacho B no ve la plantilla de A', async () => {
    await request(app.getHttpServer()).get(`/api/templates/${templateA}`).set(B()).expect(404);
  });

  it('aislamiento: B no puede generar con la plantilla de A (404)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/documents/from-template')
      .set(B())
      .send({ templateId: templateA, matterId: matterB })
      .expect(404);
    expect(res.body.messageKey).toBe('templates.notFound');
  });

  it('edita y elimina la plantilla', async () => {
    await request(app.getHttpServer())
      .patch(`/api/templates/${templateA}`)
      .set(A())
      .send({ name: 'Carta de reclamación (v2)' })
      .expect(200);
    await request(app.getHttpServer()).delete(`/api/templates/${templateA}`).set(A()).expect(200);
    await request(app.getHttpServer()).get(`/api/templates/${templateA}`).set(A()).expect(404);
  });
});
