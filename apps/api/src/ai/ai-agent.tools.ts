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
  {
    name: 'check_conflict_of_interest',
    description:
      'Revisa CONFLICTOS DE INTERÉS (deontología): busca si una persona/empresa YA es cliente ' +
      'del despacho o YA figura como adversario en otro expediente. Devuelve coincidencias en clientes ' +
      'existentes y expedientes donde esa parte contraria interviene. Úsala ANTES de crear un cliente ' +
      'o un expediente nuevo para validar que no hay conflicto de lealtad o representación conjunta. ' +
      'Insensible a mayúsculas y búsqueda parcial.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Nombre o parte del nombre de la persona/empresa a revisar (mínimo 2 caracteres para búsqueda).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_client_detail',
    description:
      'Obtiene el detalle completo de un cliente por su ID: nombre, identificador fiscal, email, teléfono, ' +
      'dirección, y cuántos expedientes tiene. Úsala tras localizarlo con find_client o cuando necesites ' +
      'consultar los datos exactos de un cliente concreto para redactar escritos, asociar expedientes u ' +
      'otra gestión. NO la uses para listar clientes (usa find_client para búsqueda) ni para modificar datos ' +
      '(la herramienta es solo lectura).',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'ID único del cliente en el sistema (su clave primaria).',
        },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'get_matter_timeline',
    description:
      'Devuelve la cronología del expediente: feed temporal unificado de documentos, tareas/plazos ' +
      'procedimentales, movimientos contables (honorarios, gastos), correos y mensajes de chat. ' +
      'Únicamente lectura. Úsala para "¿cuál es el historial del expediente?", "¿qué ha pasado en...?" ' +
      'o para contextualizar auditoría/progreso. Devuelve los eventos más recientes (máx. 80, de las ' +
      'últimas 50 entradas de cada fuente) ordenados cronológicamente. NO la uses para crear acciones ' +
      'ni para modificar nada; solo consulta.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
      },
      required: ['matterReference'],
    },
  },
  {
    name: 'list_matters_by_status',
    description:
      'Lista expedientes del despacho filtrando por estado (OPEN, IN_PROGRESS, ON_HOLD, CLOSED, ARCHIVED). ' +
      'Opcionalmente acotados a un cliente específico. Devuelve expedientes con cliente, abogado responsable ' +
      'y total. Úsala para "¿cuántos expedientes tengo abiertos?", "expedientes en pausa", "cerrados este mes" ' +
      'o "expedientes del cliente X". Siempre pagina los resultados (20 por defecto).',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'ARCHIVED'],
          description: 'Estado del expediente a filtrar (obligatorio).',
        },
        clientId: {
          type: 'string',
          description: 'ID del cliente para acotar la búsqueda (opcional).',
        },
        page: {
          type: 'integer',
          description: 'Página de resultados (1 por defecto).',
        },
        pageSize: {
          type: 'integer',
          description: 'Expedientes por página (1-50, por defecto 20).',
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'create_client',
    description:
      'CREA un cliente/empresa/persona en el despacho y la registra en la base de datos (acción de ESCRITURA, ' +
      'reversible). Úsala SOLO cuando el usuario pida explícitamente crear, añadir o registrar un nuevo cliente. ' +
      'El identificador fiscal (NIF/CIF/NIE en ES, RNC/Cédula en RD) se valida automáticamente contra la ' +
      'jurisdicción del despacho; si no es válido, el sistema lo rechaza indicando el motivo. Si el usuario ' +
      'trabaja en ambas jurisdicciones (ES + RD), se intenta con la otra si falla la primera. Tras crearlo, ' +
      'confirma al usuario el nombre, identificador fiscal y que ya puede usarlo en expedientes. NO uses esta ' +
      'herramienta para actualizaciones o cambios de datos existentes (usa el editor de clientes).',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Nombre legal del cliente (empresa, persona o razón social; 2-200 caracteres).',
        },
        taxId: {
          type: 'string',
          description:
            'Identificador fiscal válido en la jurisdicción del despacho: NIF/CIF/NIE (España) o ' +
            'RNC/Cédula (República Dominicana). Se normaliza automáticamente.',
        },
        email: {
          type: 'string',
          description: 'Correo electrónico del cliente (opcional; usado para contacto y portal).',
        },
        phone: {
          type: 'string',
          description: 'Teléfono de contacto (opcional; máximo 40 caracteres).',
        },
        address: {
          type: 'string',
          description: 'Dirección postal del cliente (opcional; máximo 300 caracteres).',
        },
        docType: {
          type: 'string',
          enum: ['PASSPORT', 'OTHER'],
          description:
            'Tipo de documento si el cliente es extranjero. PASSPORT o OTHER activa validación ligera ' +
            '(si se omite, validación fiscal estricta de la jurisdicción).',
        },
      },
      required: ['name', 'taxId'],
    },
  },
  {
    name: 'create_matter',
    description:
      'CREA un nuevo expediente (acción de ESCRITURA, reversible). Úsala SOLO cuando el usuario pida ' +
      'crear, abrir, registrar o añadir un nuevo asunto/caso. Asocia a un cliente existente (por su ' +
      'nombre o identificador). Opcionalmente asigna un letrado responsable (si el usuario lo precisa) ' +
      'y añade detalles de litigación (juzgado, parte contraria, nº de autos, fase procesal). El ' +
      'expediente se abre en estado OPEN con referencia auto-generada (EXP-AAAA-NNNN) salvo que ' +
      'proporciones una. CUÁNDO usarla: usuario dice "crear expediente", "abrir caso de X", "registro ' +
      'nuevo asunto"; NO cuando pide crear una tarea O un documento dentro de un expediente existente ' +
      '(usa create_task o draft_and_save_document). CUÁNDO NO: nunca uses esto para litigios fiscales, ' +
      'insolvencia, quiebra sin explícita orden del usuario; firma siempre con el letrado responsable.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Título/asunto principal del expediente (2-200 caracteres; p. ej. "Compraventa inmueble Av. Principal").',
        },
        type: {
          type: 'string',
          description:
            'Tipo de asunto: "Mercantil", "Civil", "Laboral", "Fiscal", "Penal", etc. (2-80 caracteres).',
        },
        clientName: {
          type: 'string',
          description:
            'Nombre exacto del cliente (se resuelve a su ID; debe existir en el despacho).',
        },
        opposingParty: {
          type: 'string',
          description: 'Nombre de la parte contraria (opcional; p. ej. "Constructora ABC S.L.").',
        },
        opposingPartyTaxId: {
          type: 'string',
          description: 'Identificador fiscal de la contraparte (opcional; NIF, RNC, etc.).',
        },
        lawyerId: {
          type: 'string',
          description: 'ID del letrado responsable (opcional; si se omite, sin asignar al crear).',
        },
        court: {
          type: 'string',
          description:
            'Juzgado/tribunal (para litigación; opcional; p. ej. "Juzgado de lo Mercantil Nº 3").',
        },
        caseNumber: {
          type: 'string',
          description:
            'Número de autos/procedimiento (para litigación; opcional; p. ej. "3/2026").',
        },
        proceduralPhase: {
          type: 'string',
          description:
            'Fase procesal (para litigación; opcional; p. ej. "Fase de alegaciones", "Sentencia").',
        },
        opposingCounsel: {
          type: 'string',
          description:
            'Letrado de la contraparte (para litigación; opcional; p. ej. "Despacho XYZ").',
        },
        reference: {
          type: 'string',
          description: 'Referencia interna (opcional; si se omite, se genera auto. EXP-2026-NNNN).',
        },
      },
      required: ['title', 'type', 'clientName'],
    },
  },
  {
    name: 'apply_presentation_to_matter',
    description:
      'CREA e INSTANCIA un checklist de presentación en un expediente (acción de ESCRITURA, reversible). ' +
      'Aplica un tipo de presentación (conjunto de requisitos de documentos + tareas automáticas) a un ' +
      'expediente concreto. Genera un checklist con ítems para rastrear la aportación de documentos y ' +
      'crea automáticamente las tareas/plazos asociados al tipo. Útil para tramitaciones, ofertas públicas, ' +
      'fusiones, procesos de due diligence o cualquier procedimiento con lista de requisitos. Úsala SOLO ' +
      'cuando el usuario pida aplicar un tipo de presentación a un expediente (p. ej. "aplicar checklist ' +
      'de OPA", "instancia el checklist de M&A", "usa el checklist de requisitos regulatorios"). ' +
      'Tras aplicarla, confirma el expediente, el tipo de presentación y cuántos ítems/tareas se han creado.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia del expediente donde instanciar el checklist (p. ej. EXP-2026-0042).',
        },
        presentationTypeName: {
          type: 'string',
          description:
            'Nombre del tipo de presentación a aplicar (se buscará dentro del despacho). ' +
            'Ejemplos: "Oferta Pública de Adquisición", "Due Diligence de Fusión", "Requisitos SIC".',
        },
      },
      required: ['matterReference', 'presentationTypeName'],
    },
  },
  {
    name: 'get_task_detail',
    description:
      'Devuelve el detalle completo de una tarea (plazo) por su ID: título, descripción, estado, ' +
      'fecha de vencimiento, expediente asociado, responsable, y metadatos procedurales si aplica ' +
      '(plazo calculado, tipo de plazo, notificación que lo generó). Úsala para inspeccionar una tarea ' +
      'específica cuando necesites contexto completo antes de reportar, modificar o seguir por un detalle. ' +
      'NO crea ni modifica tareas: úsala SOLO para leer detalles de una tarea que ya existe.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID único de la tarea (requerido).',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'list_templates',
    description:
      'Lista las plantillas reutilizables guardadas en la biblioteca del despacho (contratos, escritos, ' +
      'cláusulas estándar, etc.). Devuelve nombre, descripción e identificadores de campos combinables ' +
      '({{merge_fields}}). Úsala para "¿qué plantillas tengo?", "busca plantillas de X" o cuando el ' +
      'usuario quiera reutilizar un documento que ya existe. NO crea ni edita plantillas: para eso usa ' +
      'create_template. Úsala ANTES de proponer redactar desde cero para evitar duplicar trabajo.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_clauses',
    description:
      'Lista todas las cláusulas reutilizables de la biblioteca del despacho, ordenadas por nombre. ' +
      'Devuelve id, nombre y contenido de cada cláusula. Úsala cuando el usuario pregunte por cláusulas ' +
      'disponibles, busque una cláusula existente para reutilizarla en un documento, o quiera ver el ' +
      'repertorio completo del despacho. NO la uses si el usuario pide crear una cláusula nueva ' +
      '(no hay herramienta aún) o buscar por palabra clave dentro de las cláusulas (usa search_firm_knowledge).',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_stale_matters_report',
    description:
      'Genera un INFORME de expedientes sin actividad reciente (OPEN/IN_PROGRESS). "Sin actividad" = ningún ' +
      'movimiento en 30+ días (configurable con PRODUCTIVITY_STALE_DAYS). Agrupa por letrado responsable. ' +
      'Úsala para "¿qué expedientes están dormidos?", "¿dónde hay expedientes sin mover?" o "dame un informe ' +
      'de expedientes estancados". LECTURA PURA: no modifica datos.',
    inputSchema: {
      type: 'object',
      properties: {
        staleDays: {
          type: 'integer',
          description:
            'Días sin actividad para considerar un expediente dormido (1-365, por defecto 30). ' +
            'Se ignora si PRODUCTIVITY_STALE_DAYS está configurada.',
        },
        limit: {
          type: 'integer',
          description: 'Máximo de expedientes a devolver POR LETRADO (1-50, por defecto 20).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_closing_checklists',
    description:
      'Obtiene los checklists de cierre de un expediente (condiciones previas, entregables, hojas de firma) ' +
      'con su progreso: total de partidas y cuántas están SATISFECHAS o RENUNCIADAS. Útil para "¿qué falta en ' +
      'el cierre?", "¿cuál es el progreso del cierre?" o "¿qué condiciones previas faltan?". Cada checklist ' +
      'muestra también la fecha de firma, cierre y longstop date (si existen).',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
      },
      required: ['matterReference'],
    },
  },
  {
    name: 'update_task_status',
    description:
      'ACTUALIZA el estado de una tarea existente del despacho (acción de ESCRITURA, reversible). ' +
      'Cambia el status entre TODO → IN_PROGRESS → DONE → CANCELLED. Úsala SOLO cuando el usuario ' +
      'pida explícitamente cambiar el estado de una tarea (p. ej. "marca como hecha", "estoy trabajando ' +
      'en eso", "cancela esta tarea"). También puedes usarla para actualizar otros campos opcionalmente ' +
      '(título, descripción, fecha de vencimiento). Tras actualizar, confirma al usuario el nuevo estado.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID o identificador único de la tarea a actualizar.',
        },
        status: {
          type: 'string',
          enum: ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
          description: 'Nuevo estado de la tarea (TODO, IN_PROGRESS, DONE o CANCELLED).',
        },
        title: {
          type: 'string',
          description: 'Nuevo título de la tarea (opcional, 2-200 caracteres).',
        },
        description: {
          type: 'string',
          description: 'Nueva descripción de la tarea (opcional, hasta 2000 caracteres).',
        },
        dueDate: {
          type: 'string',
          description: 'Nueva fecha de vencimiento en formato YYYY-MM-DD (opcional).',
        },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'extend_task_deadline',
    description:
      'EXTIENDE el plazo de vencimiento de una tarea existente (acción de ESCRITURA, reversible). ' +
      'Úsala SOLO cuando el usuario pida aplazar, diferir o extender una tarea/plazo. Proporciona ' +
      'la tarea por su título (busca dentro de las tareas abiertas del despacho) y la nueva fecha ' +
      'de vencimiento. Tras extenderla, confirma al usuario la tarea actualizada y la nueva fecha.',
    inputSchema: {
      type: 'object',
      properties: {
        taskTitle: {
          type: 'string',
          description:
            'Título exacto o parte de la tarea a extender (búsqueda insensible a mayúsculas).',
        },
        newDueDate: {
          type: 'string',
          description: 'Nueva fecha de vencimiento en formato YYYY-MM-DD.',
        },
        reason: {
          type: 'string',
          description: 'Motivo del aplazamiento (opcional, para auditoría).',
        },
      },
      required: ['taskTitle', 'newDueDate'],
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
  '- create_template: crear una PLANTILLA reutilizable en la biblioteca (no va a un expediente). El body',
  '  es un ESQUELETO conciso con campos {{como_este}} (NO un documento completo de muchas páginas). Si te',
  '  piden "un paquete de plantillas de X" (p. ej. M&A: LOI, NDA, term sheet, SPA, checklist de due',
  '  diligence), crea las plantillas UNA POR UNA: una sola llamada a create_template por respuesta, nunca',
  '  todas en el mismo mensaje (evita exceder el límite de tokens).',
  '- create_client: dar de alta un CLIENTE (valida el identificador fiscal de la jurisdicción).',
  '- create_matter: abrir un EXPEDIENTE nuevo vinculado a un cliente.',
  '- apply_presentation_to_matter: instanciar un checklist de presentación en un expediente (crea sus',
  '  tareas/plazos asociados).',
  '',
  'PROCESOS (encadena herramientas): puedes resolver peticiones multi-paso combinando tus tools. Ejemplo:',
  '"da de alta a [cliente] y abre un expediente de [asunto]" → check_conflict_of_interest →',
  '(si no hay conflicto) create_client → create_matter → apply_presentation_to_matter. SIEMPRE comprueba',
  'el CONFLICTO DE INTERÉS antes de crear cliente o expediente. Propón el plan completo y pide UNA sola',
  'confirmación para todas las escrituras juntas.',
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
