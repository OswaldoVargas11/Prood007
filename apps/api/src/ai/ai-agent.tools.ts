import type { AiToolDefinition } from '@legalflow/domain';

/**
 * Catálogo de herramientas del asistente AGÉNTICO (Ola 1: SOLO LECTURA). Cada herramienta se ejecuta en
 * `AiAgentService` SIEMPRE acotada por `tenantId` (además de RLS en BD). El MVP no muta nada: deja que el
 * modelo CONSULTE datos reales del despacho antes de responder, en vez de inventar. Las herramientas de
 * ESCRITURA (crear tarea, redactar y guardar escrito) llegarán en una ola posterior con matriz de
 * permisos por rol — ver docs/architecture/ADR-001-agentic-ai.md.
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
];

/** Instrucciones de sistema del asistente agéntico. */
export const AGENT_SYSTEM_PROMPT = [
  'Eres el asistente del despacho de abogados dentro de Lawzora. Tu trabajo es ayudar al letrado con',
  'consultas sobre sus expedientes, clientes, tareas y documentos.',
  '',
  'Reglas:',
  '- USA las herramientas para consultar datos REALES del despacho antes de afirmar nada. No inventes',
  '  referencias, nombres, fechas ni importes.',
  '- Si una herramienta no devuelve resultados, dilo con claridad y sugiere cómo afinar la búsqueda.',
  '- Cita las referencias de expediente (p. ej. EXP-2026-0042) cuando te bases en ellas.',
  '- Responde en español, de forma concisa y profesional.',
  '- Eres de SOLO LECTURA: no puedes crear ni modificar nada todavía. Si te lo piden, explica que de',
  '  momento solo puedes consultar e informar, y describe los pasos que el letrado debería seguir.',
].join('\n');
