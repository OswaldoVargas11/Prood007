import { SignedXml } from 'xml-crypto';
import type { DgiiCertMaterial } from './dgii-cert';

/**
 * Firma ENVUELTA (enveloped) de un XML con el certificado del emisor — el mecanismo que exige la DGII
 * tanto para la SEMILLA de autenticación como para el e-CF. Produce una `<Signature>` XML-DSig
 * (RSA-SHA256, c14n exclusiva) como último hijo de la raíz, con el certificado X.509 en `KeyInfo`.
 *
 * NOTA DE CERTIFICACIÓN: la DGII pide XAdES-BES (XML-DSig + propiedades cualificadas: SigningTime,
 * SigningCertificate). Esta función emite el núcleo XML-DSig correcto y verificable; las propiedades
 * cualificadas XAdES y la conformidad EXACTA se cierran durante el set de pruebas de CerteCF con el
 * certificado real (ver DGII_SETUP.md). El seam es estable: solo cambia el cuerpo de esta función.
 */
export function signEnvelopedXml(xml: string, cert: DgiiCertMaterial): string {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  sig.addReference({
    // Referencia a todo el documento (URI vacío) con la transformada enveloped + c14n exclusiva.
    xpath: '/*',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  // Inserta la <Signature> como último hijo del elemento raíz (firma envuelta).
  sig.computeSignature(xml, { location: { reference: '/*', action: 'append' } });
  return sig.getSignedXml();
}
