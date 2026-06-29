import forge from 'node-forge';
import { DOMParser } from '@xmldom/xmldom';
import { select1 } from 'xpath';
import { SignedXml } from 'xml-crypto';
import { loadCertFromP12 } from './dgii-cert';
import { signEnvelopedXml } from './dgii-signer';

/** Genera un .p12 autofirmado (solo para el test): clave RSA + certificado en PKCS#12. */
function makeSelfSignedP12(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: 'commonName', value: 'RNC TEST 130000000' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(der, 'binary');
}

describe('DGII signer', () => {
  it('parsea un .p12 y produce una firma envuelta verificable', () => {
    const p12 = makeSelfSignedP12('clave-test');
    const cert = loadCertFromP12(p12, 'clave-test');

    expect(cert.privateKeyPem).toContain('PRIVATE KEY');
    expect(cert.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(cert.subjectCommonName).toContain('130000000');

    const xml = '<ECF><Encabezado><eNCF>E310000000001</eNCF></Encabezado></ECF>';
    // signingTime/idSuffix inyectados ⇒ salida determinista (reproducible en CI).
    const signed = signEnvelopedXml(xml, cert, {
      signingTime: new Date('2026-02-05T10:00:00.000Z'),
      idSuffix: 'test',
    });

    expect(signed).toContain('Signature');
    expect(signed).toContain('DigestValue');
    expect(signed).toContain('X509Certificate');

    // Verificación criptográfica real: localizar la <Signature> y comprobarla con el certificado.
    const doc = new DOMParser().parseFromString(signed, 'text/xml');
    const sigNode = select1("//*[local-name(.)='Signature']", doc as unknown as Node);
    const verifier = new SignedXml({ publicCert: cert.certificatePem });
    verifier.loadSignature(sigNode as Parameters<SignedXml['loadSignature']>[0]);
    // checkSignature valida TODAS las referencias: la del documento Y la de SignedProperties (XAdES).
    expect(verifier.checkSignature(signed)).toBe(true);
  }, 30_000);

  it('emite propiedades cualificadas XAdES-BES firmadas (SigningTime + SigningCertificate)', () => {
    const p12 = makeSelfSignedP12('clave-test');
    const cert = loadCertFromP12(p12, 'clave-test');
    const xml = '<ECF><Encabezado><eNCF>E310000000001</eNCF></Encabezado></ECF>';
    const signed = signEnvelopedXml(xml, cert, {
      signingTime: new Date('2026-02-05T10:00:00.000Z'),
      idSuffix: 'test',
    });

    // Las propiedades cualificadas XAdES están presentes y la firma sigue verificando.
    expect(signed).toContain('SignedProperties');
    expect(signed).toContain('SigningTime');
    expect(signed).toContain('2026-02-05T10:00:00.000Z');
    expect(signed).toContain('SigningCertificate');
    expect(signed).toContain('CertDigest');
    expect(signed).toContain('IssuerSerial');

    const doc = new DOMParser().parseFromString(signed, 'text/xml');
    // Hay DOS referencias firmadas: el documento (URI="") y SignedProperties (Type=.../SignedProperties).
    const refs = select1(
      "count(//*[local-name(.)='SignedInfo']/*[local-name(.)='Reference'])",
      doc as unknown as Node,
    );
    expect(Number(refs)).toBe(2);
    const spRef = select1(
      "//*[local-name(.)='Reference'][@Type='http://uri.etsi.org/01903#SignedProperties']",
      doc as unknown as Node,
    );
    expect(spRef).toBeTruthy();

    const sigNode = select1("//*[local-name(.)='Signature']", doc as unknown as Node);
    const verifier = new SignedXml({ publicCert: cert.certificatePem });
    verifier.loadSignature(sigNode as Parameters<SignedXml['loadSignature']>[0]);
    expect(verifier.checkSignature(signed)).toBe(true);
  }, 30_000);

  it('es determinista con signingTime/idSuffix fijos (reproducible en golden/CI)', () => {
    const p12 = makeSelfSignedP12('clave-test');
    const cert = loadCertFromP12(p12, 'clave-test');
    const xml = '<ECF><Encabezado><eNCF>E310000000001</eNCF></Encabezado></ECF>';
    const opts = { signingTime: new Date('2026-02-05T10:00:00.000Z'), idSuffix: 'test' };
    expect(signEnvelopedXml(xml, cert, opts)).toBe(signEnvelopedXml(xml, cert, opts));
  }, 30_000);

  it('lanza con la contraseña incorrecta', () => {
    const p12 = makeSelfSignedP12('correcta');
    expect(() => loadCertFromP12(p12, 'incorrecta')).toThrow();
  });
});
