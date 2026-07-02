import { VerifactuStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuSubmissionService, mapAcuse } from './verifactu-submission.service';
import { parseRespuesta } from './verifactu.client';

describe('VerifactuSubmissionService (gated)', () => {
  const OLD_ENV = process.env.VERIFACTU_ENV;
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.VERIFACTU_ENV;
    else process.env.VERIFACTU_ENV = OLD_ENV;
  });

  it('sin VERIFACTU_ENV no se transmite NADA: queda el estado y solo se anota el detalle', async () => {
    delete process.env.VERIFACTU_ENV;
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          number: 'FAC-2026-0001',
          complianceFormat: 'VERIFACTU',
          verifactuXml: '<sum1:RegistroAlta/>',
          verifactuStatus: VerifactuStatus.PENDING,
        }),
        updateMany,
      },
      tenant: { findUniqueOrThrow: jest.fn() },
    } as unknown as PrismaService;
    const credentials = { loadCert: jest.fn() } as unknown as VerifactuCredentialService;

    const svc = new VerifactuSubmissionService(prisma, new VerifactuConfig(), credentials);
    const result = await svc.transmit('tenant-1', 'inv-1');

    expect(result.status).toBe(VerifactuStatus.PENDING);
    expect(result.detail).toContain('VERIFACTU_ENV');
    // Ni certificado ni red: el gate corta antes.
    expect(credentials.loadCert as jest.Mock).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { verifactuStatusDetail: expect.stringContaining('VERIFACTU_ENV') },
      }),
    );
  });

  it('una factura con acuse final NO se re-remite (idempotencia del cron)', async () => {
    process.env.VERIFACTU_ENV = 'test';
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          number: 'FAC-2026-0001',
          complianceFormat: 'VERIFACTU',
          verifactuXml: '<sum1:RegistroAlta/>',
          verifactuStatus: VerifactuStatus.ACCEPTED,
        }),
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const credentials = { loadCert: jest.fn() } as unknown as VerifactuCredentialService;

    const svc = new VerifactuSubmissionService(prisma, new VerifactuConfig(), credentials);
    const result = await svc.transmit('tenant-1', 'inv-1');

    expect(result.status).toBe(VerifactuStatus.ACCEPTED);
    expect(credentials.loadCert as jest.Mock).not.toHaveBeenCalled();
  });

  it('una factura ES anterior al registro AEAT (sin verifactuXml) no aplica', async () => {
    process.env.VERIFACTU_ENV = 'test';
    const prisma = {
      invoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-0',
          number: 'FAC-2025-0001',
          complianceFormat: 'VERIFACTU',
          verifactuXml: null,
          verifactuStatus: VerifactuStatus.NOT_APPLICABLE,
        }),
      },
    } as unknown as PrismaService;
    const svc = new VerifactuSubmissionService(
      prisma,
      new VerifactuConfig(),
      {} as VerifactuCredentialService,
    );
    expect((await svc.transmit('tenant-1', 'inv-0')).status).toBe(VerifactuStatus.NOT_APPLICABLE);
  });
});

describe('mapAcuse', () => {
  it('mapea los estados del acuse AEAT', () => {
    expect(
      mapAcuse('Correcto', {
        estadoRegistro: 'Correcto',
        codigoError: null,
        descripcionError: null,
      }),
    ).toEqual({ status: VerifactuStatus.ACCEPTED, detail: null });
    expect(
      mapAcuse('ParcialmenteCorrecto', {
        estadoRegistro: 'AceptadoConErrores',
        codigoError: '2001',
        descripcionError: 'Aviso',
      }).status,
    ).toBe(VerifactuStatus.ACCEPTED_WITH_ERRORS);
    expect(
      mapAcuse('Incorrecto', {
        estadoRegistro: 'Incorrecto',
        codigoError: '1105',
        descripcionError: 'NIF inválido',
      }),
    ).toEqual({ status: VerifactuStatus.REJECTED, detail: '1105 — NIF inválido' });
  });

  it('un duplicado (registro ya remitido) se reconcilia como aceptado, no como rechazo', () => {
    const r = mapAcuse('Incorrecto', {
      estadoRegistro: 'Incorrecto',
      codigoError: '3000',
      descripcionError: 'Registro de facturación duplicado',
    });
    expect(r.status).toBe(VerifactuStatus.ACCEPTED_WITH_ERRORS);
    expect(r.detail).toContain('duplicado');
  });
});

describe('parseRespuesta', () => {
  it('extrae EstadoEnvio, CSV y las líneas del acuse', () => {
    const body =
      `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>` +
      `<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="urn:x">` +
      `<tikR:CSV>CSV123</tikR:CSV>` +
      `<tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>` +
      `<tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio>` +
      `<tikR:RespuestaLinea><tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro></tikR:RespuestaLinea>` +
      `</tikR:RespuestaRegFactuSistemaFacturacion>` +
      `</env:Body></env:Envelope>`;
    const r = parseRespuesta(body);
    expect(r.estadoEnvio).toBe('Correcto');
    expect(r.csv).toBe('CSV123');
    expect(r.tiempoEsperaEnvio).toBe(60);
    expect(r.lineas).toEqual([
      { estadoRegistro: 'Correcto', codigoError: null, descripcionError: null },
    ]);
  });

  it('un SOAP Fault lanza (fallo de transporte, no un acuse)', () => {
    const body =
      `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>` +
      `<env:Fault><faultcode>Client</faultcode><faultstring>Certificado no admitido</faultstring></env:Fault>` +
      `</env:Body></env:Envelope>`;
    expect(() => parseRespuesta(body)).toThrow(/Certificado no admitido/);
  });
});
