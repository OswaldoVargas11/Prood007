import forge from 'node-forge';

/** Material del certificado del emisor extraído del `.p12`/`.pfx`, en PEM (para firmar y para KeyInfo). */
export interface DgiiCertMaterial {
  privateKeyPem: string;
  certificatePem: string;
  /** RNC del emisor leído del subject del certificado (si está presente), para cotejo. */
  subjectCommonName: string | null;
}

/**
 * Extrae la clave privada y el certificado de un fichero PKCS#12 (`.p12`/`.pfx`) — el formato en el que
 * las autoridades de certificación dominicanas (p. ej. Camara de Comercio / Avansi) entregan el
 * certificado digital del emisor. El `.p12` se guarda CIFRADO (AES-256-GCM) y se descifra en memoria solo
 * para firmar; nunca se persiste el PEM en claro.
 *
 * @param p12 Contenido binario del `.p12`.
 * @param password Contraseña del `.p12`.
 */
// OIDs de los bags PKCS#12 (siempre definidos en runtime; el tipo los declara opcionales).
const OID_SHROUDED = forge.pki.oids.pkcs8ShroudedKeyBag as string;
const OID_KEY = forge.pki.oids.keyBag as string;
const OID_CERT = forge.pki.oids.certBag as string;

export function loadCertFromP12(p12: Buffer, password: string): DgiiCertMaterial {
  const der = forge.util.createBuffer(p12.toString('binary'));
  const asn1 = forge.asn1.fromDer(der);
  const p12Obj = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  // Clave privada: bag pkcs8ShroudedKeyBag (o keyBag como respaldo).
  const keyBags = p12Obj.getBags({ bagType: OID_SHROUDED });
  let keyBag = keyBags[OID_SHROUDED]?.[0];
  if (!keyBag) {
    const plain = p12Obj.getBags({ bagType: OID_KEY });
    keyBag = plain[OID_KEY]?.[0];
  }
  const certBags = p12Obj.getBags({ bagType: OID_CERT });
  const certBag = certBags[OID_CERT]?.[0];

  if (!keyBag?.key || !certBag?.cert) {
    throw new Error(
      'El .p12 no contiene clave privada y certificado válidos (¿contraseña incorrecta?).',
    );
  }

  const cnField = certBag.cert.subject.getField('CN');
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keyBag.key),
    certificatePem: forge.pki.certificateToPem(certBag.cert),
    subjectCommonName: cnField?.value ?? null,
  };
}
