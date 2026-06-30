import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { select1 } from 'xpath';
import { SignedXml } from 'xml-crypto';
import { loadCertFromP12, type DgiiCertMaterial } from '../dgii/dgii-cert';
import { VerifactuSignerService } from './verifactu-signer.service';
import type { VerifactuCredentialService } from './verifactu-credential.service';

/** Genera un .p12 autofirmado (solo para el test): clave RSA + certificado en PKCS#12. */
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

/** Registro de alta Verifactu mínimo y representativo (estructura para la firma, no el XSD completo). */
const REGISTRO_XML =
  '<RegistroAlta>' +
  '<IDFactura><IDEmisorFactura>B12345674</IDEmisorFactura><NumSerieFactura>FAC-2026-0001</NumSerieFactura>' +
  '<FechaExpedicionFactura>15-01-2026</FechaExpedicionFactura></IDFactura>' +
  '<ImporteTotal>1210.00</ImporteTotal>' +
  '<Huella>abc123</Huella>' +
  '</RegistroAlta>';

describe('VerifactuSignerService', () => {
  const cert: DgiiCertMaterial = loadCertFromP12(makeSelfSignedP12('clave-es'), 'clave-es');
  const opts = { signingTime: new Date('2026-01-15T09:00:00.000Z'), idSuffix: 'verifactu' };

  it('firma el registro (XAdES-BES) y la firma VERIFICA criptográficamente', () => {
    const svc = new VerifactuSignerService(null as unknown as VerifactuCredentialService);
    const { signedXml, signedBy } = svc.signWithCert(REGISTRO_XML, cert, opts);

    expect(signedBy).toContain('B12345674');
    expect(signedXml).toContain('SignedProperties');
    expect(signedXml).toContain('SigningCertificate');

    const doc = new DOMParser().parseFromString(signedXml, 'text/xml');
    const sigNode = select1("//*[local-name(.)='Signature']", doc as unknown as Node);
    const verifier = new SignedXml({ publicCert: cert.certificatePem });
    verifier.loadSignature(sigNode as Parameters<SignedXml['loadSignature']>[0]);
    expect(verifier.checkSignature(signedXml)).toBe(true);
  }, 30_000);

  it('signRecord usa el certificado del despacho vía VerifactuCredentialService.loadCert', async () => {
    const credentials = {
      loadCert: jest.fn().mockResolvedValue(cert),
    } as unknown as VerifactuCredentialService;
    const svc = new VerifactuSignerService(credentials);

    const result = await svc.signRecord('tenant-1', REGISTRO_XML, opts);
    expect(credentials.loadCert).toHaveBeenCalledWith('tenant-1');
    expect(result).not.toBeNull();
    expect(result!.signedXml).toContain('SignatureValue');
  }, 30_000);

  it('signRecord devuelve null si el despacho no tiene certificado (gated)', async () => {
    const credentials = {
      loadCert: jest.fn().mockResolvedValue(null),
    } as unknown as VerifactuCredentialService;
    const svc = new VerifactuSignerService(credentials);

    expect(await svc.signRecord('tenant-sin-cert', REGISTRO_XML)).toBeNull();
  });
});
