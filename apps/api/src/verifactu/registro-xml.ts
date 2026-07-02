import { createHash } from 'node:crypto';

/**
 * Generación del XML del **registro de facturación de alta** Verifactu (RD 1007/2023 + Orden
 * HAC/1177/2024, esquema `SuministroInformacion.xsd`) a partir del registro fiscal interno ya emitido.
 *
 * DOS huellas conviven y NO se mezclan (LAW-82, restricción de compatibilidad):
 *  - la huella INTERNA (`Invoice.recordHash`), calculada por el provider de compliance y encadenada en BD
 *    desde el primer día — hay facturas reales en prod con esa cadena; su formato NO cambia;
 *  - la huella AEAT (`<Huella>` de este XML), calculada aquí según la especificación oficial de la AEAT
 *    (concatenación `campo=valor&…` + SHA-256 hex MAYÚSCULAS) y encadenada SOLO entre registros Verifactu
 *    (la anterior se persiste en `Invoice.verifactuHuella`). Es la que valida el banco de pruebas.
 *
 * PENDIENTE DE RATIFICACIÓN con el banco de pruebas de la AEAT (certificado del owner, ver
 * docs/fiscal/FINISHING-CHECKLIST.md): forma exacta de fechas/huso, tolerancias de ImporteTotal con
 * retención IRPF (criterio FAQ AEAT: la retención NO se resta del ImporteTotal del registro) y el bloque
 * `SistemaInformatico` con el NIF real del productor del software.
 */

/** Espacio de nombres del esquema de información de los registros (sum1). */
export const NS_SUM1 =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

/** Identificación del SIF (Sistema Informático de Facturación) que exige el registro (RD 1007/2023 art. 9). */
export interface SistemaInformaticoInfo {
  /** Nombre/razón social del productor del software (Lawzora). */
  nombreRazon: string;
  /** NIF del productor del software (lo aporta el owner; sin él la remisión real no certifica). */
  nif: string;
  nombreSistemaInformatico: string;
  /** Código identificador del SIF (2 caracteres). */
  idSistemaInformatico: string;
  version: string;
  /** Número de instalación (una por despacho/tenant). */
  numeroInstalacion: string;
}

export interface RegistroAltaInput {
  /** NIF del obligado a expedir (el despacho). */
  nifEmisor: string;
  nombreRazonEmisor: string;
  numSerieFactura: string;
  /** Fecha de expedición ISO `yyyy-mm-dd` (se convierte a `dd-mm-yyyy` del esquema AEAT). */
  fechaExpedicion: string;
  /** F1 normal · R1 rectificativa (mapeado del registro interno). */
  tipoFactura: 'F1' | 'R1';
  /** S sustitución · I diferencias — solo rectificativas. */
  tipoRectificativa?: 'S' | 'I';
  facturasRectificadas?: { numSerieFactura: string; fechaExpedicion: string | null }[];
  descripcionOperacion: string;
  destinatario?: { nombreRazon: string; nif: string };
  /** Desglose por tipo impositivo (IVA): mismas líneas redondeadas que los totales internos. */
  desglose: { tipoImpositivo: string; baseImponible: string; cuotaRepercutida: string }[];
  cuotaTotal: string;
  /** Importe total del registro AEAT (base + cuota; la retención IRPF no se resta — FAQ AEAT). */
  importeTotal: string;
  /**
   * Registro Verifactu ANTERIOR del despacho para el encadenamiento AEAT, o `null` si este es el primero
   * (→ `<PrimerRegistro>S</PrimerRegistro>`). `huella` = huella AEAT del registro anterior.
   */
  registroAnterior: {
    nifEmisor: string;
    numSerieFactura: string;
    fechaExpedicion: string;
    huella: string;
  } | null;
  /** Momento de generación del registro, ISO 8601 con huso (inyectable para reproducibilidad en tests). */
  fechaHoraHusoGenRegistro: string;
  sistema: SistemaInformaticoInfo;
}

export interface RegistroAltaResult {
  /** XML del `<sum1:RegistroAlta>` SIN firmar (la firma XAdES lo envuelve después si hay certificado). */
  xml: string;
  /** Huella AEAT de ESTE registro (SHA-256 hex mayúsculas según la especificación oficial). */
  huella: string;
}

/** `yyyy-mm-dd` → `dd-mm-yyyy` (formato de fecha del esquema AEAT). */
function fechaAeat(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Huella del registro de alta según la especificación de la AEAT (Orden HAC/1177/2024): concatenación
 * `campo=valor&…` de los campos tasados, con la huella del registro anterior (vacía en el primero),
 * SHA-256 en hexadecimal MAYÚSCULAS.
 */
export function computeHuellaAeat(p: {
  nifEmisor: string;
  numSerieFactura: string;
  fechaExpedicionAeat: string;
  tipoFactura: string;
  cuotaTotal: string;
  importeTotal: string;
  huellaAnterior: string | null;
  fechaHoraHusoGenRegistro: string;
}): string {
  const cadena =
    `IDEmisorFactura=${p.nifEmisor.trim()}` +
    `&NumSerieFactura=${p.numSerieFactura.trim()}` +
    `&FechaExpedicionFactura=${p.fechaExpedicionAeat.trim()}` +
    `&TipoFactura=${p.tipoFactura.trim()}` +
    `&CuotaTotal=${p.cuotaTotal.trim()}` +
    `&ImporteTotal=${p.importeTotal.trim()}` +
    `&Huella=${(p.huellaAnterior ?? '').trim()}` +
    `&FechaHoraHusoGenRegistro=${p.fechaHoraHusoGenRegistro.trim()}`;
  return createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase();
}

/** Construye el `<sum1:RegistroAlta>` y su huella AEAT. Determinista dados los mismos datos de entrada. */
export function buildRegistroAltaXml(input: RegistroAltaInput): RegistroAltaResult {
  const fechaExp = fechaAeat(input.fechaExpedicion);
  const huella = computeHuellaAeat({
    nifEmisor: input.nifEmisor,
    numSerieFactura: input.numSerieFactura,
    fechaExpedicionAeat: fechaExp,
    tipoFactura: input.tipoFactura,
    cuotaTotal: input.cuotaTotal,
    importeTotal: input.importeTotal,
    huellaAnterior: input.registroAnterior?.huella ?? null,
    fechaHoraHusoGenRegistro: input.fechaHoraHusoGenRegistro,
  });

  const rectificadas =
    input.tipoFactura === 'R1' && input.facturasRectificadas?.length
      ? `<sum1:FacturasRectificadas>` +
        input.facturasRectificadas
          .map(
            (f) =>
              `<sum1:IDFacturaRectificada>` +
              `<sum1:IDEmisorFactura>${esc(input.nifEmisor)}</sum1:IDEmisorFactura>` +
              `<sum1:NumSerieFactura>${esc(f.numSerieFactura)}</sum1:NumSerieFactura>` +
              `<sum1:FechaExpedicionFactura>${
                f.fechaExpedicion ? fechaAeat(f.fechaExpedicion) : fechaExp
              }</sum1:FechaExpedicionFactura>` +
              `</sum1:IDFacturaRectificada>`,
          )
          .join('') +
        `</sum1:FacturasRectificadas>`
      : '';

  const destinatarios = input.destinatario
    ? `<sum1:Destinatarios><sum1:IDDestinatario>` +
      `<sum1:NombreRazon>${esc(input.destinatario.nombreRazon)}</sum1:NombreRazon>` +
      `<sum1:NIF>${esc(input.destinatario.nif)}</sum1:NIF>` +
      `</sum1:IDDestinatario></sum1:Destinatarios>`
    : '';

  const desglose = input.desglose
    .map(
      (d) =>
        `<sum1:DetalleDesglose>` +
        `<sum1:Impuesto>01</sum1:Impuesto>` + // 01 = IVA
        `<sum1:ClaveRegimen>01</sum1:ClaveRegimen>` + // 01 = régimen general
        `<sum1:CalificacionOperacion>S1</sum1:CalificacionOperacion>` + // sujeta y no exenta
        `<sum1:TipoImpositivo>${esc(d.tipoImpositivo)}</sum1:TipoImpositivo>` +
        `<sum1:BaseImponibleOimporteNoSujeto>${esc(d.baseImponible)}</sum1:BaseImponibleOimporteNoSujeto>` +
        `<sum1:CuotaRepercutida>${esc(d.cuotaRepercutida)}</sum1:CuotaRepercutida>` +
        `</sum1:DetalleDesglose>`,
    )
    .join('');

  const encadenamiento = input.registroAnterior
    ? `<sum1:Encadenamiento><sum1:RegistroAnterior>` +
      `<sum1:IDEmisorFactura>${esc(input.registroAnterior.nifEmisor)}</sum1:IDEmisorFactura>` +
      `<sum1:NumSerieFactura>${esc(input.registroAnterior.numSerieFactura)}</sum1:NumSerieFactura>` +
      `<sum1:FechaExpedicionFactura>${fechaAeat(input.registroAnterior.fechaExpedicion)}</sum1:FechaExpedicionFactura>` +
      `<sum1:Huella>${esc(input.registroAnterior.huella)}</sum1:Huella>` +
      `</sum1:RegistroAnterior></sum1:Encadenamiento>`
    : `<sum1:Encadenamiento><sum1:PrimerRegistro>S</sum1:PrimerRegistro></sum1:Encadenamiento>`;

  const s = input.sistema;
  const xml =
    `<sum1:RegistroAlta xmlns:sum1="${NS_SUM1}">` +
    `<sum1:IDVersion>1.0</sum1:IDVersion>` +
    `<sum1:IDFactura>` +
    `<sum1:IDEmisorFactura>${esc(input.nifEmisor)}</sum1:IDEmisorFactura>` +
    `<sum1:NumSerieFactura>${esc(input.numSerieFactura)}</sum1:NumSerieFactura>` +
    `<sum1:FechaExpedicionFactura>${fechaExp}</sum1:FechaExpedicionFactura>` +
    `</sum1:IDFactura>` +
    `<sum1:NombreRazonEmisor>${esc(input.nombreRazonEmisor)}</sum1:NombreRazonEmisor>` +
    `<sum1:TipoFactura>${input.tipoFactura}</sum1:TipoFactura>` +
    (input.tipoFactura === 'R1' && input.tipoRectificativa
      ? `<sum1:TipoRectificativa>${input.tipoRectificativa}</sum1:TipoRectificativa>`
      : '') +
    rectificadas +
    `<sum1:DescripcionOperacion>${esc(input.descripcionOperacion)}</sum1:DescripcionOperacion>` +
    destinatarios +
    `<sum1:Desglose>${desglose}</sum1:Desglose>` +
    `<sum1:CuotaTotal>${esc(input.cuotaTotal)}</sum1:CuotaTotal>` +
    `<sum1:ImporteTotal>${esc(input.importeTotal)}</sum1:ImporteTotal>` +
    encadenamiento +
    `<sum1:SistemaInformatico>` +
    `<sum1:NombreRazon>${esc(s.nombreRazon)}</sum1:NombreRazon>` +
    `<sum1:NIF>${esc(s.nif)}</sum1:NIF>` +
    `<sum1:NombreSistemaInformatico>${esc(s.nombreSistemaInformatico)}</sum1:NombreSistemaInformatico>` +
    `<sum1:IdSistemaInformatico>${esc(s.idSistemaInformatico)}</sum1:IdSistemaInformatico>` +
    `<sum1:Version>${esc(s.version)}</sum1:Version>` +
    `<sum1:NumeroInstalacion>${esc(s.numeroInstalacion)}</sum1:NumeroInstalacion>` +
    `<sum1:TipoUsoPosibleSoloVerifactu>S</sum1:TipoUsoPosibleSoloVerifactu>` +
    `<sum1:TipoUsoPosibleMultiOT>S</sum1:TipoUsoPosibleMultiOT>` +
    `<sum1:IndicadorMultiplesOT>S</sum1:IndicadorMultiplesOT>` +
    `</sum1:SistemaInformatico>` +
    `<sum1:FechaHoraHusoGenRegistro>${esc(input.fechaHoraHusoGenRegistro)}</sum1:FechaHoraHusoGenRegistro>` +
    `<sum1:TipoHuella>01</sum1:TipoHuella>` + // 01 = SHA-256
    `<sum1:Huella>${huella}</sum1:Huella>` +
    `</sum1:RegistroAlta>`;

  return { xml, huella };
}
