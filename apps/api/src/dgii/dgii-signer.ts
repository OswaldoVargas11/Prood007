import { createHash, createSign, X509Certificate } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { DgiiCertMaterial } from './dgii-cert';

// URIs de algoritmos / espacios de nombres XML-DSig + XAdES.
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const NS_XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const ALG_EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const ALG_SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ALG_RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const TYPE_SIGNED_PROPS = 'http://uri.etsi.org/01903#SignedProperties';

export interface SignOptions {
  /**
   * Momento de la firma (XAdES `SigningTime`). Se INYECTA para reproducibilidad en los tests golden;
   * en producción, por defecto el instante actual. Forma parte de las propiedades firmadas.
   */
  signingTime?: Date;
  /**
   * Sufijo de los `Id` (`Signature`/`SignedProperties`). Inyectable para que la salida sea determinista
   * en los tests; en producción basta con que sea único dentro del documento.
   */
  idSuffix?: string;
}

/**
 * Firma ENVUELTA (enveloped) **XAdES-BES** de un XML con el certificado del emisor — el mecanismo que
 * exige la DGII tanto para la SEMILLA de autenticación como para el e-CF. Produce una `<ds:Signature>`
 * (RSA-SHA256, c14n exclusiva) como último hijo de la raíz, con:
 *   - una `<Reference URI="">` al documento (transformada enveloped + c14n exclusiva),
 *   - el certificado X.509 en `<KeyInfo>`,
 *   - y las **propiedades cualificadas XAdES** (`SigningTime`, `SigningCertificate`) dentro de
 *     `<SignedProperties>`, FIRMADAS mediante una segunda `<Reference Type=".../SignedProperties">`.
 *
 * Cómo está construida: xml-crypto no sabe emitir el `<ds:Object>`/`SignedProperties` de XAdES, así que
 * se ensambla la `<Signature>` a mano reutilizando la c14n exclusiva de xml-crypto (`getCanonXml`) para
 * las huellas y `node:crypto` para la firma RSA del `SignedInfo`. La firma resultante VERIFICA con
 * `SignedXml.checkSignature` (lo prueba `dgii-signer.spec.ts`).
 *
 * NOTA DE CERTIFICACIÓN: el núcleo XAdES-BES (estructura + huellas + firma) es correcto y verificable. El
 * PERFIL EXACTO que ratifica la DGII (p. ej. `SigningCertificateV2`, política de firma, forma RFC2253 del
 * `IssuerName`) se cierra ejecutando el set de pruebas de CerteCF con el certificado real (ver
 * DGII_SETUP.md). El seam es estable: solo cambia el cuerpo de esta función.
 */
export function signEnvelopedXml(
  xml: string,
  cert: DgiiCertMaterial,
  options: SignOptions = {},
): string {
  const signingTime = (options.signingTime ?? new Date()).toISOString();
  const suffix = options.idSuffix ?? 'ecf';
  const sigId = `xmldsig-${suffix}`;
  const signedPropsId = `${sigId}-signedprops`;

  // ── Material X.509 para KeyInfo y para la huella del certificado (SigningCertificate) ──────────────
  const x509 = new X509Certificate(cert.certificatePem);
  const certDigest = createHash('sha256').update(x509.raw).digest('base64');
  const certB64 = pemBodyBase64(cert.certificatePem);
  const issuerName = toRfc2253(x509.issuer);
  const serialNumber = hexToDecimal(x509.serialNumber);

  // ── SignedProperties (se construye UNA vez y se reutiliza para la huella y para el <Object>) ───────
  const signedProps =
    `<xades:SignedProperties xmlns:xades="${NS_XADES}" xmlns:ds="${NS_DS}" Id="${signedPropsId}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate>` +
    `<xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA256}"/>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${escapeXml(issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert>` +
    `</xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;

  // ── Huellas (SHA-256 sobre la c14n exclusiva) ──────────────────────────────────────────────────────
  const signedPropsDigest = sha256Base64(canonicalize([ALG_EXC_C14N], signedProps));

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  if (!root) throw new Error('XML a firmar sin elemento raíz.');
  // Huella del documento: misma transformada que aplicará el verificador (enveloped quita la firma; en
  // este punto aún no hay <Signature>, así que la c14n es del documento tal cual).
  const docDigest = sha256Base64(canonicalizeNode([ALG_ENVELOPED, ALG_EXC_C14N], root));

  // ── SignedInfo (referencia al documento + referencia a SignedProperties) ───────────────────────────
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="${NS_DS}">` +
    `<ds:CanonicalizationMethod Algorithm="${ALG_EXC_C14N}"/>` +
    `<ds:SignatureMethod Algorithm="${ALG_RSA_SHA256}"/>` +
    `<ds:Reference URI="">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="${ALG_ENVELOPED}"/>` +
    `<ds:Transform Algorithm="${ALG_EXC_C14N}"/>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA256}"/>` +
    `<ds:DigestValue>${docDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Type="${TYPE_SIGNED_PROPS}" URI="#${signedPropsId}">` +
    `<ds:Transforms><ds:Transform Algorithm="${ALG_EXC_C14N}"/></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA256}"/>` +
    `<ds:DigestValue>${signedPropsDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`;

  // Firma RSA-SHA256 sobre la c14n exclusiva del SignedInfo.
  const signedInfoCanon = canonicalize([ALG_EXC_C14N], signedInfo);
  const signatureValue = createSign('RSA-SHA256')
    .update(signedInfoCanon, 'utf8')
    .sign(cert.privateKeyPem, 'base64');

  // ── <ds:Signature> completa y anexión como último hijo de la raíz ──────────────────────────────────
  const signature =
    `<ds:Signature xmlns:ds="${NS_DS}" Id="${sigId}">` +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo>` +
    `<ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data>` +
    `</ds:KeyInfo>` +
    `<ds:Object>` +
    `<xades:QualifiedProperties xmlns:xades="${NS_XADES}" Target="#${sigId}">` +
    signedProps +
    `</xades:QualifiedProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`;

  const sigDoc = new DOMParser().parseFromString(signature, 'text/xml');
  const sigEl = sigDoc.documentElement;
  if (!sigEl) throw new Error('No se pudo construir la <Signature>.');
  root.appendChild(doc.importNode(sigEl, true));
  return new XMLSerializer().serializeToString(doc);
}

/** c14n exclusiva de un fragmento XML (string) reutilizando el canonicalizador de xml-crypto. */
function canonicalize(transforms: string[], xmlFragment: string): string {
  const node = new DOMParser().parseFromString(xmlFragment, 'text/xml').documentElement;
  return canonicalizeNode(transforms, node);
}

function canonicalizeNode(transforms: string[], node: unknown): string {
  // getCanonXml es público en xml-crypto v6; aplica las transformadas en orden sobre un clon del nodo.
  return new SignedXml().getCanonXml(
    transforms as Parameters<SignedXml['getCanonXml']>[0],
    node as Parameters<SignedXml['getCanonXml']>[1],
  );
}

function sha256Base64(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('base64');
}

/** Cuerpo base64 de un certificado PEM (sin cabeceras BEGIN/END ni saltos de línea). */
function pemBodyBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
}

/** Serie del certificado (hex de node:crypto) a decimal, como exige `<X509SerialNumber>`. */
function hexToDecimal(hex: string): string {
  return BigInt(`0x${hex}`).toString(10);
}

/**
 * DN del emisor en forma RFC2253 (RDNs en orden inverso, separados por coma). `X509Certificate.issuer`
 * los entrega uno por línea, del más significativo al menos. La forma EXACTA la ratifica el set de pruebas.
 */
function toRfc2253(issuer: string): string {
  return issuer
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .reverse()
    .join(',');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
