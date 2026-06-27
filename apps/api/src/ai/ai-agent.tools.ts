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
    name: 'search_firm_knowledge',
    description:
      'Busca por SIGNIFICADO en el TEXTO de los documentos y expedientes indexados del despacho (RAG ' +
      'semántico) y devuelve fragmentos CITABLES (referencia + extracto). Úsala para "¿dónde dice…?", ' +
      '"busca cláusulas sobre…" o "qué documento menciona…". Cita el fragmento que devuelva.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Qué buscar por significado (concepto, cláusula, tema).',
        },
        limit: { type: 'integer', description: 'Máximo de fragmentos (1-12, por defecto 6).' },
      },
      required: ['query'],
    },
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
  {
    name: 'create_template',
    description:
      'CREA una PLANTILLA de documento REUTILIZABLE en la biblioteca del despacho (acción de ESCRITURA; ' +
      'NO va a un expediente concreto). Úsala cuando pidan generar plantillas o "un paquete de plantillas ' +
      'de X" (p. ej. M&A: LOI, NDA, term sheet, SPA, checklist de due diligence): llama una vez por cada ' +
      'plantilla. El "body" es el texto con campos {{entre_llaves}} para rellenar luego (p. ej. ' +
      '{{cliente.nombre}}, {{fecha}}).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre de la plantilla (2-200 caracteres).' },
        body: {
          type: 'string',
          description: 'Texto completo de la plantilla, con campos {{merge}} donde proceda.',
        },
        description: {
          type: 'string',
          description: 'Breve descripción de para qué sirve (opcional).',
        },
      },
      required: ['name', 'body'],
    },
  },
];

/** Instrucciones de sistema del asistente agéntico. */
export const AGENT_SYSTEM_PROMPT = [
  'Eres el asistente del despacho de abogados dentro de Lawzora (jurisdicciones España y República',
  'Dominicana). Ayudas al letrado con expedientes, clientes, tareas, documentos y plantillas.',
  '',
  'Sé RESOLUTIVO: si te piden crear, redactar o generar algo que PUEDES hacer con tus herramientas',
  '(tareas/plazos, escritos en un expediente, o plantillas reutilizables), HAZLO —proponiéndolo— en lugar',
  'de enumerar lo que no puedes. Solo di que no puedes si de verdad no existe herramienta para ello.',
  'Evita disculpas y listas de limitaciones; ve al grano y propón la acción concreta.',
  '',
  'Herramientas de ESCRITURA (siempre reversibles y no fiscales):',
  '- create_task: crear una tarea o plazo (opcionalmente en un expediente).',
  '- draft_and_save_document: redactar y GUARDAR un escrito como borrador en un EXPEDIENTE concreto.',
  '- create_template: crear una PLANTILLA reutilizable en la biblioteca (no va a un expediente); el body',
  '  admite campos {{como_este}}. Si te piden "un paquete de plantillas de X" (p. ej. M&A: LOI, NDA, term',
  '  sheet, SPA, checklist de due diligence), GENERA varias llamando a create_template una vez por documento.',
  '',
  'Confirmación (HITL): toda escritura requiere el visto bueno del letrado. Si una herramienta de escritura',
  'responde "requires_confirmation", la acción NO se ha hecho: di en una frase qué vas a crear y pide',
  'confirmación. Si propones varias, preséntalas juntas y pide una sola confirmación.',
  '',
  'Calidad:',
  '- USA las herramientas para consultar datos REALES antes de afirmar nada. NUNCA inventes referencias,',
  '  nombres, fechas, importes, sentencias ni artículos.',
  '- Para jurisprudencia/legislación usa legal_research y remite a la fuente oficial (no la inventes).',
  '- Para encontrar dónde se dice algo en los documentos usa search_firm_knowledge y cita el fragmento.',
  '- Cita las referencias de expediente (p. ej. EXP-2026-0042) en las que te bases.',
  '- Responde en español, conciso y profesional. Adapta los escritos a la jurisdicción (ES o RD).',
  '- NO puedes emitir facturas, cobrar, firmar ni enviar correos: si lo piden, dilo y deja que el letrado',
  '  lo haga.',
].join('\n');
