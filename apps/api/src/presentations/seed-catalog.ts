import { Jurisdiction } from '@legalflow/domain';

/**
 * Catálogo de ARRANQUE de checklists de presentación por tipo de gestión. Es contenido EDITABLE de
 * ejemplo: el despacho debe revisarlo y adaptarlo a su práctica y a la normativa vigente. Se clona
 * dentro del tenant bajo demanda (botón «Importar catálogo de ejemplo»). `jurisdiction: null` = aplica
 * a ambas (ES y RD). No pretende ser asesoramiento legal ni una lista exhaustiva.
 */
export interface SeedRequirement {
  name: string;
  description?: string;
  required?: boolean;
}
export interface SeedPresentationType {
  name: string;
  sector: string;
  jurisdiction: Jurisdiction | null;
  description?: string;
  requirements: SeedRequirement[];
}

export const PRESENTATION_SEED_CATALOG: SeedPresentationType[] = [
  // ── Inmobiliario ────────────────────────────────────────────────────────────
  {
    name: 'Compraventa de inmueble',
    sector: 'Inmobiliario',
    jurisdiction: Jurisdiction.ES,
    description: 'Documentación habitual para una compraventa de vivienda en España.',
    requirements: [
      { name: 'Nota simple registral actualizada del inmueble' },
      { name: 'Título de propiedad del vendedor (escritura)' },
      { name: 'Certificado de eficiencia energética' },
      { name: 'Cédula de habitabilidad', required: false },
      { name: 'Último recibo del IBI' },
      { name: 'Certificado de estar al corriente con la comunidad de propietarios' },
      { name: 'DNI/NIE de las partes' },
      { name: 'Justificante de los medios de pago' },
    ],
  },
  {
    name: 'Compraventa de inmueble',
    sector: 'Inmobiliario',
    jurisdiction: Jurisdiction.DO,
    description: 'Documentación habitual para una compraventa inmobiliaria en RD.',
    requirements: [
      { name: 'Certificación de estado jurídico del inmueble (Registro de Títulos)' },
      { name: 'Certificado de Título / Constancia anotada' },
      { name: 'Recibo de pago del IPI (Impuesto al Patrimonio Inmobiliario)', required: false },
      { name: 'Cédula de identidad o pasaporte de las partes' },
      { name: 'Carta de saldo / no objeción si existe hipoteca', required: false },
      { name: 'Tasación del inmueble', required: false },
    ],
  },
  // ── Familia / Matrimonio ──────────────────────────────────────────────────────
  {
    name: 'Divorcio de mutuo acuerdo',
    sector: 'Familia',
    jurisdiction: Jurisdiction.ES,
    description: 'Documentación para un divorcio de mutuo acuerdo en España.',
    requirements: [
      { name: 'Certificado literal de matrimonio' },
      { name: 'Certificados de nacimiento de los hijos', required: false },
      { name: 'Convenio regulador firmado' },
      { name: 'DNI de ambos cónyuges' },
      { name: 'Volante de empadronamiento', required: false },
      { name: 'Capitulaciones matrimoniales si existen', required: false },
    ],
  },
  {
    name: 'Divorcio por mutuo consentimiento',
    sector: 'Familia',
    jurisdiction: Jurisdiction.DO,
    description: 'Documentación para un divorcio por mutuo consentimiento en RD.',
    requirements: [
      { name: 'Acta de matrimonio' },
      { name: 'Actas de nacimiento de los hijos', required: false },
      { name: 'Cédulas de identidad de los cónyuges' },
      { name: 'Acto de estipulaciones y convenciones' },
      { name: 'Inventario de bienes de la comunidad', required: false },
    ],
  },
  // ── Mercantil / Societario ──────────────────────────────────────────────────
  {
    name: 'Constitución de sociedad',
    sector: 'Mercantil',
    jurisdiction: Jurisdiction.ES,
    description: 'Documentación para constituir una sociedad mercantil en España.',
    requirements: [
      { name: 'Certificación negativa de denominación social (RMC)' },
      { name: 'DNI/NIE de socios y administradores' },
      { name: 'Estatutos sociales' },
      { name: 'Justificante del desembolso del capital social' },
      { name: 'Declaración de titularidad real' },
      { name: 'Alta censal (modelo 036)', required: false },
    ],
  },
  {
    name: 'Constitución de sociedad',
    sector: 'Mercantil',
    jurisdiction: Jurisdiction.DO,
    description: 'Documentación para constituir una sociedad en RD.',
    requirements: [
      { name: 'Registro de Nombre Comercial (ONAPI)' },
      { name: 'Cédula o pasaporte de socios y administradores' },
      { name: 'Estatutos sociales / acto constitutivo' },
      { name: 'Constancia de pago del impuesto de constitución (DGII)' },
      { name: 'Lista de suscripción y pago de acciones' },
      { name: 'Registro Mercantil (Cámara de Comercio)' },
    ],
  },
  // ── Minería ───────────────────────────────────────────────────────────────────
  {
    name: 'Concesión / permiso de exploración minera',
    sector: 'Minería',
    jurisdiction: Jurisdiction.DO,
    description:
      'Documentación para solicitar derechos mineros en RD (revisar con DGM/Medio Ambiente).',
    requirements: [
      { name: 'Solicitud ante la Dirección General de Minería' },
      { name: 'Plano cartográfico del área solicitada' },
      { name: 'Licencia / estudio de impacto ambiental (Medio Ambiente)' },
      { name: 'Cédula o registro mercantil del solicitante' },
      { name: 'Programa de trabajo y presupuesto de inversión' },
      { name: 'Comprobante de pago de derechos' },
    ],
  },
  {
    name: 'Derechos mineros (investigación/explotación)',
    sector: 'Minería',
    jurisdiction: Jurisdiction.ES,
    description: 'Documentación para derechos mineros en España (revisar con la autoridad minera).',
    requirements: [
      { name: 'Solicitud de permiso de investigación o explotación' },
      { name: 'Proyecto de explotación y plan de restauración' },
      { name: 'Estudio de impacto ambiental' },
      { name: 'Designación del terreno (coordenadas)' },
      { name: 'Acreditación de capacidad técnica y económica' },
      { name: 'Justificante de tasas' },
    ],
  },
  // ── Laboral ─────────────────────────────────────────────────────────────────
  {
    name: 'Reclamación por despido',
    sector: 'Laboral',
    jurisdiction: null,
    description: 'Documentación habitual para preparar una reclamación por despido.',
    requirements: [
      { name: 'Contrato de trabajo' },
      { name: 'Nóminas de los últimos 12 meses' },
      { name: 'Carta de despido' },
      { name: 'Vida laboral / historial de cotizaciones', required: false },
      { name: 'Convenio colectivo aplicable', required: false },
      { name: 'Comunicaciones relevantes con la empresa', required: false },
    ],
  },
];
