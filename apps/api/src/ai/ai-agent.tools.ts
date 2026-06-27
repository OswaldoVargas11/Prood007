import type { AiToolDefinition } from '@legalflow/domain';

/**
 * Catálogo de herramientas del asistente AGÉNTICO. Cada herramienta se ejecuta en `AiAgentService`
 * SIEMPRE acotada por `tenantId` (además de RLS en BD).
 *  · CONSULTA (Ola 1): search_matters, get_matter, list_open_tasks, find_client, list_documents.
 *  · ESCRITURA (Ola 2): create_task — única acción mutante, REVERSIBLE y NO fiscal; reutiliza
 *    `TasksService` (con sus validaciones de negocio + auditoría). Deliberadamente NO se exponen
 *    acciones irreversibles ni fiscales (facturas, pagos, firmas, envíos, borrados) — ver
 *    docs/architecture/ADR-001-agentic-ai.md.
 */
export const AGENT_TOOLS: AiToolDefinition[] = [
  {
    name: 'search_matters',
    description:
      'Busca expedientes del despacho por texto (coincide en referencia, título o parte contraria). ' +
      'Úsala para localizar el expediente del que habla el usuario antes de responder.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Texto a buscar en referencia/título/parte contraria. Vacío = expedientes recientes.',
        },
        limit: { type: 'integer', description: 'Máximo de resultados (1-25, por defecto 10).' },
      },
      required: [],
    },
  },
  {
    name: 'get_matter',
    description:
      'Devuelve el detalle de un expediente por su referencia exacta: cliente, estado, parte contraria, ' +
      'juzgado, nº de tareas y documentos. Úsala tras localizarlo con search_matters.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
      },
      required: ['reference'],
    },
  },
  {
    name: 'list_open_tasks',
    description:
      'Lista tareas/plazos ABIERTOS (pendientes o en curso), ordenados por fecha de vencimiento. ' +
      'Opcionalmente acotados a un expediente por su referencia. Útil para "¿qué vence?" o "próximos plazos".',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia del expediente para acotar (opcional).',
        },
        limit: { type: 'integer', description: 'Máximo de tareas (1-50, por defecto 20).' },
      },
      required: [],
    },
  },
  {
    name: 'find_client',
    description:
      'Busca clientes del despacho por identificador fiscal (NIF/RNC) o por nombre. Devuelve nombre, ' +
      'identificador fiscal y cuántos expedientes tiene.',
    inputSchema: {
      type: 'object',
      properties: {
        taxId: {
          type: 'string',
          description: 'Identificador fiscal exacto (NIF español o RNC dominicano).',
        },
        name: { type: 'string', description: 'Parte del nombre del cliente.' },
      },
      required: [],
    },
  },
  {
    name: 'list_documents',
    description:
      'Lista los documentos de un expediente (por referencia). Devuelve nombres y total.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: { type: 'string', description: 'Referencia exacta del expediente.' },
      },
      required: ['matterReference'],
    },
  },
  {
    name: 'firm_overview',
    description:
      'Visión rápida del despacho: nº de expedientes activos, tareas abiertas y plazos VENCIDOS. ' +
      'Úsala para "¿cómo va el despacho?", "¿tengo algo urgente?" o "¿qué llevo vencido?".',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'legal_research',
    description:
      'Devuelve enlaces a FUENTES JURÍDICAS OFICIALES (jurisprudencia y legislación) con los términos ' +
      'de búsqueda ya cargados, por jurisdicción (ES: CENDOJ/BOE; RD: Poder Judicial/DGII). Úsala cuando ' +
      'el usuario pregunte por jurisprudencia, legislación o normativa. NO inventes citas legales: ofrece ' +
      'estos enlaces para que el letrado consulte y verifique la fuente primaria.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Términos de búsqueda jurídica (materia, artículos, partes, nº de procedimiento...).',
        },
        jurisdiction: {
          type: 'string',
          enum: ['es', 'do'],
          description: 'Jurisdicción a consultar (por defecto la del despacho).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_task',
    description:
      'CREA una tarea o plazo en el despacho (acción de ESCRITURA, reversible). Úsala SOLO cuando el ' +
      'usuario pida explícitamente crear, añadir o agendar una tarea/recordatorio. Asóciala a un ' +
      'expediente por su referencia cuando proceda. Tras crearla, confirma al usuario lo que has creado.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título de la tarea (2-200 caracteres).' },
        matterReference: {
          type: 'string',
          description: 'Referencia del expediente al que asociarla (opcional).',
        },
        description: { type: 'string', description: 'Detalle de la tarea (opcional).' },
        dueDate: {
          type: 'string',
          description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional).',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'draft_and_save_document',
    description:
      'REDACTA y GUARDA un escrito en un expediente (acción de ESCRITURA, reversible). Genera un PDF con ' +
      'el membrete del despacho que queda como BORRADOR pendiente de revisión del letrado. Úsala SOLO ' +
      'cuando el usuario pida redactar/preparar/guardar un documento. TÚ redactas el contenido y lo pasas ' +
      'en "content"; tras guardarlo, confirma el nombre y el expediente.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia del expediente donde guardar el escrito.',
        },
        title: { type: 'string', description: 'Título/nombre del documento (2-200 caracteres).' },
        content: {
          type: 'string',
          description:
            'Texto completo del escrito ya redactado (lo redactas tú; se renderiza a PDF).',
        },
      },
      required: ['matterReference', 'title', 'content'],
    },
  },
];

/** Instrucciones de sistema del asistente agéntico. */
export const AGENT_SYSTEM_PROMPT = [
  'Eres el asistente del despacho de abogados dentro de Lawzora. Tu trabajo es ayudar al letrado con',
  'sus expedientes, clientes, tareas y documentos.',
  '',
  'Reglas:',
  '- USA las herramientas para consultar datos REALES del despacho antes de afirmar nada. No inventes',
  '  referencias, nombres, fechas ni importes.',
  '- Si una herramienta no devuelve resultados, dilo con claridad y sugiere cómo afinar la búsqueda.',
  '- Cita las referencias de expediente (p. ej. EXP-2026-0042) cuando te bases en ellas.',
  '- Responde en español, de forma concisa y profesional.',
  '- Para preguntas de jurisprudencia/legislación usa legal_research y ofrece los enlaces a fuentes',
  '  oficiales; NUNCA inventes sentencias, artículos ni citas: remite a la fuente primaria.',
  '- Puedes CREAR tareas/plazos con create_task, pero SOLO cuando el usuario lo pida explícitamente.',
  '  Tras crear una tarea, confirma lo que has creado (título, expediente, fecha de vencimiento).',
  '- Puedes REDACTAR y GUARDAR un escrito en un expediente con draft_and_save_document (queda como',
  '  borrador pendiente de revisión del letrado), SOLO cuando te lo pidan. Redacta tú el contenido.',
  '- No puedes modificar ni borrar nada más, ni emitir facturas, cobrar, firmar documentos ni enviar',
  '  correos. Si te lo piden, explica que esas acciones debe realizarlas el letrado.',
].join('\n');
