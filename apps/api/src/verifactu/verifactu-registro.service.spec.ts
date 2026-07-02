import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { select1 } from 'xpath';
import { SignedXml } from 'xml-crypto';
import type { Prisma } from '@prisma/client';
import { SpainComplianceProvider } from '@legalflow/compliance';
import { loadCertFromP12, type DgiiCertMaterial } from '../dgii/dgii-cert';
import { VerifactuSignerService } from './verifactu-signer.service';
import type { VerifactuCredentialService } from './verifactu-credential.service';
import { VerifactuConfig } from './verifactu.config';
import { VerifactuRegistroService, type RegistroEmissionInput } from './verifactu-registro.service';

/** Genera un .p12 autofirmado (solo para el test), como en verifactu-signer.service.spec.ts. */
function makeSelfSignedP12(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: 'commonName', value: 'REPRESENTANTE DESPACHO ES B12345674' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

function txWithPrevious(
  previous: { number: string; issueDate: Date; verifactuHuella: string } | null,
): Prisma.TransactionClient {
  return {
    invoice: { findFirst: jest.fn().mockResolvedValue(previous) },
  } as unknown as Prisma.TransactionClient;
}

function makeService(cert: DgiiCertMaterial | null): VerifactuRegistroService {
  const credentials = {
    loadCert: jest.fn().mockResolvedValue(cert),
  } as unknown as VerifactuCredentialService;
  return new VerifactuRegistroService(
    new VerifactuConfig(),
    new VerifactuSignerService(credentials),
  );
}

const NOW = new Date('2026-01-15T09:00:00.000Z');

function emissionInput(overrides: Partial<RegistroEmissionInput> = {}): RegistroEmissionInput {
  return {
    nifEmisor: 'B12345674',
    nombreRazonEmisor: 'Despacho ES SL',
    numSerieFactura: 'FAC-2026-0001',
    fechaExpedicion: '2026-01-15',
    destinatario: { nombreRazon: 'Cliente SA', nif: 'A58818501' },
    lines: [{ description: '', quantity: '1', unitPrice: '1000.00', taxCode: 'IVA_STANDARD' }],
    rates: new SpainComplianceProvider().getTaxRates().rates,
    totals: {
      taxableBase: '1000.00',
      taxAmount: '210.00',
      withholdingAmount: '150.00',
      total: '1060.00',
    },
    now: NOW,
    ...overrides,
  };
}

describe('VerifactuRegistroService', () => {
  const cert = loadCertFromP12(makeSelfSignedP12('clave-es'), 'clave-es');

  it('CON certificado: el registro sale FIRMADO (XAdES verifica) y encadenado con el anterior', async () => {
    const svc = makeService(cert);
    const tx = txWithPrevious({
      number: 'FAC-2026-0000',
      issueDate: new Date('2026-01-10T00:00:00.000Z'),
      verifactuHuella: 'A'.repeat(64),
    });

    const result = await svc.buildAndSign(tx, 'tenant-1', emissionInput());

    expect(result.signedBy).toContain('B12345674');
    // Encadenamiento AEAT: referencia el registro anterior y su huella.
    expect(result.xml).toContain('<sum1:RegistroAnterior>');
    expect(result.xml).toContain(`<sum1:Huella>${'A'.repeat(64)}</sum1:Huella>`);
    expect(result.xml).toContain('<sum1:NumSerieFactura>FAC-2026-0000</sum1:NumSerieFactura>');
    // ImporteTotal del registro AEAT = base + cuota (la retención IRPF no se resta del registro).
    expect(result.xml).toContain('<sum1:ImporteTotal>1210.00</sum1:ImporteTotal>');
    // La firma XAdES-BES envuelta verifica criptográficamente.
    const doc = new DOMParser().parseFromString(result.xml, 'text/xml');
    const sigNode = select1("//*[local-name(.)='Signature']", doc as unknown as Node);
    expect(sigNode).toBeTruthy();
    const verifier = new SignedXml({ publicCert: cert.certificatePem });
    verifier.loadSignature(sigNode as Parameters<SignedXml['loadSignature']>[0]);
    expect(verifier.checkSignature(result.xml)).toBe(true);
  }, 30_000);

  it('SIN certificado: mismo registro y misma huella, sin firma (signedBy null)', async () => {
    const withCert = await makeService(cert).buildAndSign(
      txWithPrevious(null),
      'tenant-1',
      emissionInput(),
    );
    const withoutCert = await makeService(null).buildAndSign(
      txWithPrevious(null),
      'tenant-1',
      emissionInput(),
    );

    expect(withoutCert.signedBy).toBeNull();
    expect(withoutCert.xml).not.toContain('<ds:Signature');
    expect(withoutCert.xml).toContain('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>');
    // La huella AEAT NO depende de la firma: idéntica con y sin certificado (mismos datos).
    expect(withoutCert.huella).toBe(withCert.huella);
  }, 30_000);

  it('el desglose agrupa por tipo impositivo con el mismo redondeo por línea que los totales', async () => {
    const result = await makeService(null).buildAndSign(
      txWithPrevious(null),
      'tenant-1',
      emissionInput({
        lines: [
          { description: '', quantity: '1', unitPrice: '100.00', taxCode: 'IVA_STANDARD' },
          { description: '', quantity: '1', unitPrice: '50.00', taxCode: 'IVA_STANDARD' },
          { description: '', quantity: '1', unitPrice: '30.00', taxCode: 'IVA_REDUCED' },
        ],
        totals: {
          taxableBase: '180.00',
          taxAmount: '34.50',
          withholdingAmount: '0.00',
          total: '214.50',
        },
      }),
    );
    expect(result.xml).toContain(
      '<sum1:TipoImpositivo>21.00</sum1:TipoImpositivo>' +
        '<sum1:BaseImponibleOimporteNoSujeto>150.00</sum1:BaseImponibleOimporteNoSujeto>' +
        '<sum1:CuotaRepercutida>31.50</sum1:CuotaRepercutida>',
    );
    expect(result.xml).toContain(
      '<sum1:TipoImpositivo>10.00</sum1:TipoImpositivo>' +
        '<sum1:BaseImponibleOimporteNoSujeto>30.00</sum1:BaseImponibleOimporteNoSujeto>' +
        '<sum1:CuotaRepercutida>3.00</sum1:CuotaRepercutida>',
    );
    expect(result.xml).toContain('<sum1:ImporteTotal>214.50</sum1:ImporteTotal>');
  });

  it('una factura rectificativa produce un registro R1 con causa y rectificadas', async () => {
    const result = await makeService(null).buildAndSign(
      txWithPrevious(null),
      'tenant-1',
      emissionInput({
        rectificacion: {
          tipoRectificativa: 'S',
          rectifiedNumber: 'FAC-2026-0001',
          rectifiedIssueDate: '2026-01-10',
          reason: 'Error en el importe',
        },
      }),
    );
    expect(result.xml).toContain('<sum1:TipoFactura>R1</sum1:TipoFactura>');
    expect(result.xml).toContain('<sum1:TipoRectificativa>S</sum1:TipoRectificativa>');
    expect(result.xml).toContain('Factura rectificativa: Error en el importe');
  });
});
