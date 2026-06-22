import { ClosingItemCategory } from '@legalflow/domain';

/**
 * Plantillas de checklist de cierre PRECARGADAS por tipo de operación. Son el punto de partida que el
 * despacho instancia en un expediente y luego adapta. No dependen de jurisdicción concreta (los textos
 * son neutros); lo específico se ajusta editando las partidas en la UI.
 */

export interface ClosingTemplateItem {
  category: ClosingItemCategory;
  title: string;
  detail?: string;
  responsibleParty?: string;
}

export interface ClosingTemplate {
  key: string;
  title: string;
  description: string;
  items: ClosingTemplateItem[];
}

const CP = ClosingItemCategory.CONDITION_PRECEDENT;
const DEL = ClosingItemCategory.DELIVERABLE;
const SIG = ClosingItemCategory.SIGNATURE_PAGE;

export const CLOSING_TEMPLATES: ClosingTemplate[] = [
  {
    key: 'ma_share_purchase',
    title: 'Compraventa de participaciones (M&A)',
    description: 'Cierre de una operación de compraventa de participaciones/acciones.',
    items: [
      {
        category: CP,
        title: 'Autorizaciones corporativas del vendedor',
        detail:
          'Acuerdo del órgano de administración y, en su caso, de la junta autorizando la venta.',
        responsibleParty: 'Vendedor',
      },
      {
        category: CP,
        title: 'Autorizaciones corporativas del comprador',
        detail: 'Acuerdo del órgano de administración del comprador aprobando la adquisición.',
        responsibleParty: 'Comprador',
      },
      {
        category: CP,
        title: 'Renuncia a derechos de adquisición preferente',
        detail:
          'Renuncia de los demás socios al derecho de adquisición preferente (o transcurso del plazo).',
        responsibleParty: 'Vendedor',
      },
      {
        category: CP,
        title: 'Autorizaciones regulatorias / competencia',
        detail: 'Autorización de competencia o sectorial si la operación lo requiere.',
        responsibleParty: 'Comprador',
      },
      {
        category: CP,
        title: 'Resultado satisfactorio de la due diligence',
        detail:
          'Confirmación de que la revisión legal/fiscal/financiera no ha revelado contingencias relevantes.',
        responsibleParty: 'Comprador',
      },
      {
        category: CP,
        title: 'Inexistencia de cambio adverso relevante (MAC)',
        responsibleParty: 'Ambas partes',
      },
      {
        category: DEL,
        title: 'Contrato de compraventa (SPA)',
        detail: 'Versión final acordada para firma.',
        responsibleParty: 'Despacho',
      },
      { category: DEL, title: 'Pacto de socios', responsibleParty: 'Despacho' },
      {
        category: DEL,
        title: 'Certificado de titularidad de las participaciones',
        responsibleParty: 'Vendedor',
      },
      {
        category: DEL,
        title: 'Cartas de dimisión de administradores',
        responsibleParty: 'Vendedor',
      },
      { category: DEL, title: 'Justificante de pago del precio', responsibleParty: 'Comprador' },
      {
        category: SIG,
        title: 'Escritura pública de compraventa',
        detail: 'Elevación a público ante notario.',
        responsibleParty: 'Notaría',
      },
      { category: SIG, title: 'Hoja de firmas del SPA', responsibleParty: 'Ambas partes' },
      {
        category: SIG,
        title: 'Hoja de firmas del pacto de socios',
        responsibleParty: 'Ambas partes',
      },
      {
        category: DEL,
        title: 'Inscripción de la transmisión en el Libro Registro de Socios',
        responsibleParty: 'Despacho',
      },
    ],
  },
  {
    key: 'real_estate_purchase',
    title: 'Compraventa inmobiliaria',
    description: 'Cierre de la compraventa de un inmueble.',
    items: [
      {
        category: CP,
        title: 'Nota simple registral actualizada',
        detail: 'Confirmación de titularidad y cargas.',
        responsibleParty: 'Despacho',
      },
      {
        category: CP,
        title: 'Cancelación de cargas / hipotecas previas',
        responsibleParty: 'Vendedor',
      },
      { category: CP, title: 'Certificado de eficiencia energética', responsibleParty: 'Vendedor' },
      {
        category: CP,
        title: 'Certificado de estar al corriente con la comunidad de propietarios',
        responsibleParty: 'Vendedor',
      },
      {
        category: CP,
        title: 'Justificante de pago del IBI del ejercicio en curso',
        responsibleParty: 'Vendedor',
      },
      {
        category: CP,
        title: 'Financiación del comprador confirmada',
        responsibleParty: 'Comprador',
      },
      { category: DEL, title: 'Contrato de arras / señal', responsibleParty: 'Despacho' },
      {
        category: DEL,
        title: 'Provisión de fondos para gastos e impuestos',
        responsibleParty: 'Comprador',
      },
      { category: DEL, title: 'Cédula de habitabilidad', responsibleParty: 'Vendedor' },
      { category: SIG, title: 'Escritura pública de compraventa', responsibleParty: 'Notaría' },
      { category: DEL, title: 'Liquidación de ITP / IVA', responsibleParty: 'Despacho' },
      {
        category: DEL,
        title: 'Inscripción en el Registro de la Propiedad',
        responsibleParty: 'Despacho',
      },
    ],
  },
  {
    key: 'financing',
    title: 'Operación de financiación',
    description: 'Cierre de un contrato de préstamo / financiación con garantías.',
    items: [
      { category: CP, title: 'Acuerdos sociales del prestatario', responsibleParty: 'Prestatario' },
      {
        category: CP,
        title: 'Constitución de garantías (prenda/hipoteca/aval)',
        responsibleParty: 'Prestatario',
      },
      { category: CP, title: 'Opinión legal (legal opinion)', responsibleParty: 'Despacho' },
      {
        category: CP,
        title: 'Cumplimiento de ratios / covenants iniciales',
        responsibleParty: 'Prestatario',
      },
      { category: DEL, title: 'Contrato de financiación', responsibleParty: 'Despacho' },
      { category: DEL, title: 'Documentos de garantía', responsibleParty: 'Despacho' },
      { category: DEL, title: 'Certificados de seguro', responsibleParty: 'Prestatario' },
      {
        category: SIG,
        title: 'Hoja de firmas del contrato de financiación',
        responsibleParty: 'Ambas partes',
      },
      { category: SIG, title: 'Elevación a público de las garantías', responsibleParty: 'Notaría' },
      { category: DEL, title: 'Disposición de fondos', responsibleParty: 'Entidad financiera' },
    ],
  },
  {
    key: 'blank',
    title: 'Checklist en blanco',
    description: 'Empieza desde cero y añade tus propias partidas.',
    items: [],
  },
];

export function findClosingTemplate(key: string): ClosingTemplate | undefined {
  return CLOSING_TEMPLATES.find((t) => t.key === key);
}
