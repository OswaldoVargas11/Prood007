import { request } from 'node:https';
import { DOMParser } from '@xmldom/xmldom';
import type { DgiiCertMaterial } from '../dgii/dgii-cert';
import { VerifactuConfig } from './verifactu.config';

/** Espacio de nombres del mensaje de remisión (RegFactuSistemaFacturacion). */
const NS_SUM =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_SUM1 =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

export interface VerifactuLineaResult {
  /** Correcto | AceptadoConErrores | Incorrecto (tal cual lo devuelve la AEAT). */
  estadoRegistro: string;
  codigoError: string | null;
  descripcionError: string | null;
}

export interface VerifactuSubmitResult {
  /** Correcto | ParcialmenteCorrecto | Incorrecto (estado del ENVÍO completo). */
  estadoEnvio: string;
  /** CSV (código seguro de verificación) del acuse. */
  csv: string | null;
  /** Segundos que la AEAT pide esperar antes del próximo envío (control de flujo VERI*FACTU). */
  tiempoEsperaEnvio: number | null;
  /** Acuse por registro remitido, en el mismo orden que el envío. */
  lineas: VerifactuLineaResult[];
}

/**
 * Cliente del servicio SOAP `SistemaFacturacion` de la AEAT (remisión VERI*FACTU de registros de
 * facturación). Autenticación por TLS MUTUO con el certificado del despacho (representante/sello): no hay
 * flujo de token tipo DGII — el certificado va en el canal.
 *
 * Los espacios de nombres y la forma de la respuesta siguen la documentación técnica pública de la AEAT
 * (WSDL SistemaFacturacion); se ratifican contra el banco de pruebas con el certificado real del owner
 * (docs/fiscal/FINISHING-CHECKLIST.md).
 */
export class VerifactuClient {
  constructor(private readonly config: VerifactuConfig) {}

  /**
   * Remite uno o varios registros de facturación (XML `<sum1:RegistroAlta>` ya generados/firmados) en un
   * único envío. Lanza en fallos de TRANSPORTE (red/timeout/SOAP Fault); los rechazos de registros vienen
   * en el acuse (`lineas`), no como excepción.
   */
  async submitRegistros(
    obligado: { nif: string; nombreRazon: string },
    registrosXml: string[],
    cert: DgiiCertMaterial,
  ): Promise<VerifactuSubmitResult> {
    const envelope =
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soapenv:Header/><soapenv:Body>` +
      `<sum:RegFactuSistemaFacturacion xmlns:sum="${NS_SUM}" xmlns:sum1="${NS_SUM1}">` +
      `<sum:Cabecera><sum1:ObligadoEmision>` +
      `<sum1:NombreRazon>${escapeXml(obligado.nombreRazon)}</sum1:NombreRazon>` +
      `<sum1:NIF>${escapeXml(obligado.nif)}</sum1:NIF>` +
      `</sum1:ObligadoEmision></sum:Cabecera>` +
      registrosXml.map((r) => `<sum:RegistroFactura>${r}</sum:RegistroFactura>`).join('') +
      `</sum:RegFactuSistemaFacturacion>` +
      `</soapenv:Body></soapenv:Envelope>`;

    const body = await this.postSoap(envelope, cert);
    return parseRespuesta(body);
  }

  /** POST SOAP 1.1 con TLS mutuo (clave+cert PEM del despacho). Devuelve el cuerpo de la respuesta. */
  private postSoap(envelope: string, cert: DgiiCertMaterial): Promise<string> {
    const url = new URL(this.config.soapUrl);
    const payload = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${envelope}`, 'utf8');
    return new Promise<string>((resolve, reject) => {
      const req = request(
        {
          method: 'POST',
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': payload.length,
            SOAPAction: '',
          },
          key: cert.privateKeyPem,
          cert: cert.certificatePem,
          timeout: this.config.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            // Los SOAP Fault llegan como HTTP 500 con cuerpo XML: se parsean (fault → throw en parse).
            if (res.statusCode && res.statusCode >= 400 && !text.includes('Envelope')) {
              reject(new Error(`AEAT: HTTP ${res.statusCode} ${text.slice(0, 300)}`));
              return;
            }
            resolve(text);
          });
        },
      );
      req.on('timeout', () =>
        req.destroy(new Error(`AEAT: timeout (${this.config.timeoutMs} ms)`)),
      );
      req.on('error', reject);
      req.end(payload);
    });
  }
}

/**
 * Vista estructural mínima de los nodos de @xmldom/xmldom (el tsconfig del API no carga la lib DOM;
 * mismo criterio de casts que dgii-signer.ts).
 */
interface XmlElement {
  localName: string | null;
  textContent: string | null;
  getElementsByTagName(name: string): { length: number; [i: number]: XmlElement };
}

/** Texto del primer descendiente con ese localName (independiente del prefijo de namespace). */
function textOf(node: XmlElement, localName: string): string | null {
  const el = firstByLocalName(node, localName);
  return el?.textContent?.trim() || null;
}

function firstByLocalName(node: XmlElement, localName: string): XmlElement | null {
  const all = node.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el && el.localName === localName) return el;
  }
  return null;
}

function allByLocalName(node: XmlElement, localName: string): XmlElement[] {
  const out: XmlElement[] = [];
  const all = node.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el && el.localName === localName) out.push(el);
  }
  return out;
}

/** Parsea la `RespuestaRegFactuSistemaFacturacion` (o lanza si la AEAT devolvió un SOAP Fault). */
export function parseRespuesta(soapBody: string): VerifactuSubmitResult {
  const parsed = new DOMParser().parseFromString(soapBody, 'text/xml') as unknown as {
    documentElement: XmlElement | null;
  };
  const doc = parsed.documentElement;
  if (!doc) throw new Error('AEAT: respuesta vacía o no XML.');
  const fault = firstByLocalName(doc, 'Fault');
  if (fault) {
    const detail = textOf(fault, 'faultstring') ?? fault.textContent?.trim() ?? 'SOAP Fault';
    throw new Error(`AEAT SOAP Fault: ${detail.slice(0, 300)}`);
  }
  const respuesta = firstByLocalName(doc, 'RespuestaRegFactuSistemaFacturacion');
  if (!respuesta) {
    throw new Error(`AEAT: respuesta no reconocida: ${soapBody.slice(0, 300)}`);
  }
  const tiempo = textOf(respuesta, 'TiempoEsperaEnvio');
  return {
    estadoEnvio: textOf(respuesta, 'EstadoEnvio') ?? 'Incorrecto',
    csv: textOf(respuesta, 'CSV'),
    tiempoEsperaEnvio: tiempo ? Number(tiempo) : null,
    lineas: allByLocalName(respuesta, 'RespuestaLinea').map((linea) => ({
      estadoRegistro: textOf(linea, 'EstadoRegistro') ?? 'Incorrecto',
      codigoError: textOf(linea, 'CodigoErrorRegistro'),
      descripcionError: textOf(linea, 'DescripcionErrorRegistro'),
    })),
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
