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
    name: 'how_to',
    description:
      'Explica al usuario CÓMO hacer algo en Lawzora o DÓNDE está una opción del menú (p. ej. "¿a qué ' +
      'opción del menú voy para abrir un expediente?"). Devuelve el grupo/ítem de menú, la ruta y los ' +
      'pasos. ÚSALA SIEMPRE que el usuario pregunte cómo/dónde/qué opción, y guíale por los pasos —NUNCA ' +
      'digas que no tienes acceso a la navegación. (Distinto de hacerlo tú: si pide que lo hagas, usa la ' +
      'herramienta de acción correspondiente.)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Qué quiere hacer o encontrar el usuario.' },
      },
      required: ['query'],
    },
  },
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
  {
    name: 'list_assignable_lawyers',
    description:
      'Lista los letrados del despacho asignables a expedientes (staff activo, LAWYER o FIRM_ADMIN). Solo accesible a FIRM_ADMIN. Devuelve id y nombre completo ordenados alfabéticamente. Úsala para buscar a quién asignar un expediente o un rol en el equipo.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_client_portal_user',
    description:
      'CREA un usuario de portal (rol CLIENT, solo lectura de expedientes del cliente) y ENVÍA invitación ' +
      'para fijar contraseña (acción de ESCRITURA, reversible). Úsala SOLO cuando el usuario pida crear ' +
      'acceso al portal para un cliente existente. El cliente recibirá un correo de activación para establecer ' +
      'su contraseña en el primer acceso. Tras crear el acceso, confirma al usuario el cliente, correo y que ' +
      'la invitación ha sido enviada.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'ID único del cliente en el sistema al que darle acceso de portal.',
        },
        email: {
          type: 'string',
          description:
            'Correo electrónico del usuario del portal (debe ser diferente al email del cliente si ya existe).',
        },
        password: {
          type: 'string',
          description: 'Contraseña inicial segura (mínimo 10 caracteres; se valida contra HIBP).',
        },
        fullName: {
          type: 'string',
          description: 'Nombre completo del usuario del portal (mínimo 2 caracteres).',
        },
      },
      required: ['clientId', 'email', 'password', 'fullName'],
    },
  },
  {
    name: 'add_matter_team_member',
    description:
      'AÑADE un letrado adicional al equipo del expediente (acción de ESCRITURA, reversible, idempotente). ' +
      'El letrado se suma al equipo junto al letrado responsable/líder (Matter.lawyerId). Si el letrado ya está ' +
      'en el equipo, no duplica la asignación (idempotente). Solo administrador del despacho. Útil cuando múltiples ' +
      'letrados trabajan en el mismo asunto. Tras añadirlo, confirma al usuario el equipo actualizado.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
        lawyerName: {
          type: 'string',
          description: 'Nombre completo del letrado a añadir (búsqueda insensible a mayúsculas).',
        },
      },
      required: ['matterReference', 'lawyerName'],
    },
  },
  {
    name: 'preview_task_from_deadline',
    description:
      'Calcula la fecha de vencimiento de un plazo procesal (días hábiles, festivos jurisdiccionales y locales del despacho) SIN crear la tarea. Úsala para previsualizar el vencimiento antes de crear el plazo o para cálculos de plazos procedimentales. Devuelve la fecha límite exacta y cuántos festivos se aplicaron.',
    inputSchema: {
      type: 'object',
      properties: {
        deadlineType: {
          type: 'string',
          description:
            'Tipo de plazo procesal (p. ej. "contestacion", "demanda", "apelacion", "ejecucion", etc.). Validado por la jurisdicción del despacho (ES o RD).',
        },
        startDate: {
          type: 'string',
          description:
            'Fecha de inicio del cómputo en formato YYYY-MM-DD (típicamente fecha de notificación).',
        },
        days: {
          type: 'integer',
          description:
            'Número de días para el plazo (los días se cuentan respetando días hábiles y festivos).',
        },
      },
      required: ['deadlineType', 'startDate', 'days'],
    },
  },
  {
    name: 'create_procedural_task',
    description:
      'CREA una tarea con vencimiento calculado por plazo procesal (días hábiles + festivos + jurisdicción). ' +
      'Acción de ESCRITURA, reversible y NO fiscal. Úsala cuando el letrado pida crear un plazo procesal ' +
      '(p. ej. "crea un plazo de apelación de 20 días hábiles desde el 2026-06-27" o "plazo de contestación 10 días"). ' +
      'Asocia a un expediente por su ID (matterId, opcional). Tras crearla, confirma la tarea y la fecha calculada.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Título de la tarea (opcional; si se omite se usa "Plazo: {deadlineType}"). ' +
            'Máximo 200 caracteres.',
        },
        deadlineType: {
          type: 'string',
          description:
            'Tipo de plazo procesal (jurisdicción-específico). Ejemplos: APELACION, CONTESTACION, ' +
            'OPOSICION, REPLICACION. Máximo 80 caracteres. El ComplianceProvider valida según la jurisdicción.',
        },
        startDate: {
          type: 'string',
          description:
            'Fecha de inicio del cómputo (normalmente la notificación) en formato YYYY-MM-DD. ' +
            'El sistema calcula desde aquí los días hábiles + festivos.',
        },
        days: {
          type: 'integer',
          description:
            'Número de días del plazo (1-365; p. ej. 20 para apelación, 10 para contestación).',
        },
        matterId: {
          type: 'string',
          description:
            'ID del expediente al que asociar la tarea (opcional). Si se omite, la tarea es sin expediente. ' +
            'Se valida que pertenezca al tenant del usuario.',
        },
        assigneeId: {
          type: 'string',
          description:
            'ID del letrado responsable (opcional). Si se omite, sin asignar. ' +
            'Se valida que sea usuario del mismo tenant.',
        },
        notificationRef: {
          type: 'string',
          description:
            'Referencia/acuse de la notificación que genera el plazo (opcional). ' +
            'Ejemplos: "LexNET-2026-123456", "Nº notificación 45678". Máximo 120 caracteres. ' +
            'Se guarda en el registro para auditoría (LexNET-lite).',
        },
      },
      required: ['deadlineType', 'startDate', 'days'],
    },
  },
  {
    name: 'generate_document_package',
    description:
      'ENSAMBLA un paquete de documentos en el expediente a partir de varias plantillas (una por cada plantilla). ' +
      'Útil para generar sets de intake, documentación transaccional o kits de presentación de una pasada. ' +
      'Cada plantilla se renderiza a PDF con el membrete del despacho. Úsala cuando el usuario pida ' +
      '"generar un paquete de documentos", "crear los documentos de intake", "assemblar la documentación del cierre" ' +
      'o similar (múltiples plantillas a la vez en un expediente). Tras ensamblarlos, confirma el expediente y ' +
      'cuántos documentos se han creado.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia exacta del expediente donde ensamblar el paquete (p. ej. EXP-2026-0042).',
        },
        templateNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Nombres exactos de las plantillas a incluir en el paquete (p. ej. ["Escrito de demanda", "Anexo I: Pruebas"]). ' +
            'Si la plantilla no existe, se reporta pero continúa con las demás.',
        },
      },
      required: ['matterReference', 'templateNames'],
    },
  },
  {
    name: 'compare_document_versions',
    description:
      'Compara dos versiones de un documento (redline a nivel de palabra). Extrae el texto de cada ' +
      'versión, calcula el diff de palabras y devuelve segmentos estructurados (igual/añadido/eliminado) ' +
      'más el recuento de cambios. Útil para auditar cambios en borrador/negociaciones o rastrear ' +
      'modificaciones en documentos revisados. Ambas versiones deben ser del MISMO documento.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID único del documento.',
        },
        baseVersionId: {
          type: 'string',
          description: 'ID de la versión BASE (origen) a la que se compara.',
        },
        againstVersionId: {
          type: 'string',
          description: 'ID de la versión NUEVA (destino) a comparar contra la base.',
        },
      },
      required: ['documentId', 'baseVersionId', 'againstVersionId'],
    },
  },
  {
    name: 'list_document_versions',
    description:
      'Devuelve el historial completo de versiones de un documento (todos los números de versión, fechas, autores y ' +
      'estados de revisión). Útil para auditar cambios del documento, ver quién hizo qué y cuándo, o restaurar una ' +
      'versión anterior. Solo lectura; acotado al tenant del usuario.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'ID único del documento (requerido).',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'list_presentation_types',
    description:
      "Lista los tipos de presentación (checklists de requisitos) configurados en el despacho. Devuelve el nombre, descripción, sector, jurisdicción, requisitos documentales y plantillas de tareas asociadas a cada tipo. Útil para consultas como '¿qué tipos de presentación tengo?', '¿cuáles son los requisitos de una OPA?' o '¿qué checklist aplico a este expediente?'. Solo lectura: no edita ni crea tipos.",
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_presentation_type',
    description:
      'Obtiene el detalle completo de un tipo de presentación: requisitos documentales, descripción, ' +
      'plantillas de tareas automáticas asociadas y su orden de ejecución. Úsala para consultar un tipo ' +
      'antes de aplicarlo a un expediente o para entender qué checklists y tareas se crearán. NO crea ni ' +
      'modifica tipos: esta herramienta es solo lectura. Devolverá el nombre, sector, descripción, lista ' +
      'de requisitos (orden, descripción, si es obligatorio) y plantillas de tarea con sus plazos relativos.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationTypeId: {
          type: 'string',
          description: 'ID único del tipo de presentación en el sistema.',
        },
      },
      required: ['presentationTypeId'],
    },
  },
  {
    name: 'list_matter_checklists',
    description:
      'Lista los checklists de presentación ACTIVOS de un expediente (requisitos de documentos y progreso). Devuelve cada checklist con el porcentaje de documentos aportados vs. requisitos. Útil para "¿qué falta en los requisitos?" o "¿cuál es el progreso de aportaciones?" en una tramitación, oferta pública, fusión o due diligence.',
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
    name: 'export_checklist_pdf',
    description:
      'Genera un PDF del estado de una checklist de presentación (documentos aportados vs pendientes) con membrete del despacho. Útil para enviar al cliente o documentar el progreso. Devuelve el PDF listo para descargar.',
    inputSchema: {
      type: 'object',
      properties: {
        checklistId: {
          type: 'string',
          description: 'ID único de la checklist a exportar.',
        },
      },
      required: ['checklistId'],
    },
  },
  {
    name: 'add_closing_item',
    description:
      'AÑADE una partida (requisito) al checklist de cierre de un expediente (acción de ESCRITURA, reversible). ' +
      'Una partida puede ser una condición precedente, entregable, hoja de firma u otro requisito en la lista de cierre. ' +
      'Úsala SOLO cuando el usuario pida añadir, crear o registrar un item en un checklist de cierre existente. ' +
      'Especifica la categoría (CONDITION_PRECEDENT, DELIVERABLE, SIGNATURE_PAGE, OTHER), el título, y opcionalmente: ' +
      'fase procedural, responsable, asignado (letra de letrado), documento vinculado, vencimiento, y si va en depósito ' +
      '(escrow). Tras añadirlo, confirma el checklist, el ítem y los detalles insertados.',
    inputSchema: {
      type: 'object',
      properties: {
        checklistId: {
          type: 'string',
          description: 'ID del checklist de cierre donde añadir el ítem (requerido).',
        },
        category: {
          type: 'string',
          enum: ['CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER'],
          description:
            'Categoría del ítem: CONDITION_PRECEDENT (condición precedente), DELIVERABLE (entregable), ' +
            'SIGNATURE_PAGE (hoja de firma) u OTHER (otro). Requerido.',
        },
        title: {
          type: 'string',
          description:
            'Título/nombre del ítem (2-200 caracteres; p. ej. "Certificado de Constitución"). Requerido.',
        },
        phase: {
          type: 'string',
          description:
            'Fase procedural asociada (opcional; p. ej. "Pre-cierre", "Post-cierre", "Fondos en depósito").',
        },
        responsibleParty: {
          type: 'string',
          description:
            'Parte responsable de aportar/cumplir el ítem (opcional; p. ej. "Vendedor", "Comprador", "Notario").',
        },
        assigneeId: {
          type: 'string',
          description:
            'ID del miembro del despacho asignado a dar seguimiento (opcional; debe existir en el despacho).',
        },
        documentId: {
          type: 'string',
          description:
            'ID del documento vinculado a este ítem (opcional; documento existente en el expediente).',
        },
        dueDate: {
          type: 'string',
          description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional).',
        },
        detail: {
          type: 'string',
          description: 'Descripción/detalle adicional del ítem (opcional; máximo 1000 caracteres).',
        },
        inEscrow: {
          type: 'boolean',
          description:
            'Si es true, marca el ítem como en depósito (retención hasta cierre; típico en hojas de firma). ' +
            'Opcional, por defecto false.',
        },
      },
      required: ['checklistId', 'category', 'title'],
    },
  },
  {
    name: 'generate_closing_binder',
    description:
      'GENERA el closing binder como un archivo ZIP que contiene: (1) un índice PDF con portada y todas las ' +
      'partidas del checklist agrupadas por categoría (condiciones previas, entregables, hojas de firma), ' +
      'mostrando estado, responsable, vencimiento y enlaces a los documentos; (2) los últimos ficheros de ' +
      'cada documento vinculado a las partidas, organizados en una carpeta /documentos. El ZIP está listo ' +
      'para descargar y distribuir a las partes. SOLO LECTURA: no modifica datos del expediente ni del ' +
      'checklist. Úsala cuando el usuario pida generar, descargar o empaquetar el closing binder de una ' +
      'operación.',
    inputSchema: {
      type: 'object',
      properties: {
        checklistId: {
          type: 'string',
          description: 'ID único del checklist de cierre del que generar el binder (obligatorio).',
        },
      },
      required: ['checklistId'],
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
  'GUÍA al usuario: si pregunta CÓMO hacer algo o DÓNDE está una opción ("¿a qué menú voy para abrir un',
  'expediente?"), usa how_to y explícale el grupo/ítem de menú y los pasos. NUNCA digas que no tienes',
  'acceso a la navegación: para eso está how_to. Si además quiere que lo hagas tú, ofrécelo y usa la',
  'herramienta de acción correspondiente.',
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

// ── Exposición diferida de herramientas ─────────────────────────────────────────────────────────────
// El catálogo puede crecer mucho; enviar TODAS las definiciones en cada llamada encarece y degrada la
// selección del modelo (recomendación Anthropic: >20-30 tools → cargar dinámicamente). Solución app-side:
// el executor maneja TODAS las tools, pero cada turno solo se EXPONEN al modelo el núcleo (siempre) + las
// áreas cotidianas + las áreas que el mensaje del usuario menciona. Las tools sin área mapeada se exponen
// por defecto (seguro). Las áreas de nicho (cierre, deal, data room, secretaría…) solo cuando se piden.

/** Herramientas SIEMPRE expuestas (las más comunes en cualquier conversación). */
const CORE_TOOLS = new Set<string>([
  'how_to',
  'search_matters',
  'get_matter',
  'find_client',
  'list_open_tasks',
  'firm_overview',
  'search_firm_knowledge',
  'legal_research',
  'create_task',
  'draft_and_save_document',
]);

/** Área de cada herramienta (para exposición por intención). Tools sin entrada se exponen por defecto. */
const TOOL_AREAS: Record<string, string> = {
  list_assignable_lawyers: 'matters',
  create_client_portal_user: 'clients',
  add_matter_team_member: 'matters',
  preview_task_from_deadline: 'tasks',
  create_procedural_task: 'tasks',
  generate_document_package: 'documents',
  compare_document_versions: 'documents',
  list_document_versions: 'documents',
  list_presentation_types: 'presentations',
  get_presentation_type: 'presentations',
  list_matter_checklists: 'presentations',
  export_checklist_pdf: 'presentations',
  add_closing_item: 'closing',
  generate_closing_binder: 'closing',
  search_matters: 'matters',
  get_matter: 'matters',
  get_matter_timeline: 'matters',
  list_matters_by_status: 'matters',
  list_stale_matters_report: 'matters',
  create_matter: 'matters',
  find_client: 'clients',
  get_client_detail: 'clients',
  check_conflict_of_interest: 'clients',
  create_client: 'clients',
  list_open_tasks: 'tasks',
  get_task_detail: 'tasks',
  create_task: 'tasks',
  update_task_status: 'tasks',
  extend_task_deadline: 'tasks',
  list_documents: 'documents',
  draft_and_save_document: 'documents',
  list_templates: 'templates',
  create_template: 'templates',
  apply_presentation_to_matter: 'templates',
  list_clauses: 'clauses',
  get_closing_checklists: 'closing',
};

/** Áreas cotidianas: siempre disponibles aunque el mensaje no las nombre. */
const DEFAULT_AREAS = new Set<string>(['matters', 'clients', 'tasks', 'documents', 'templates']);

/** Palabras que activan un área de nicho cuando aparecen en el mensaje (o historial reciente). */
const AREA_KEYWORDS: Record<string, string[]> = {
  clauses: ['cláusula', 'clausula', 'clausulado'],
  closing: ['cierre', 'closing', 'binder', 'condición precedente', 'condicion precedente'],
  deal: ['operación', 'operacion', 'm&a', 'transacción', 'transaccion', 'hito', 'longstop'],
  dataroom: ['data room', 'dataroom', 'sala de datos', 'due diligence', 'ddq'],
  secretary: ['secretaría', 'secretaria', 'societaria', 'junta', 'acta', 'socio', 'accionista'],
  leads: ['lead', 'prospecto', 'embudo', 'pipeline', 'captación', 'captacion'],
  kyc: ['kyc', 'aml', 'blanqueo', 'pep', 'diligencia debida'],
  registry: ['registro', 'registral'],
};

/**
 * Subconjunto de herramientas a EXPONER al modelo en este turno: núcleo + áreas cotidianas + áreas de
 * nicho mencionadas en el mensaje/historial. Reduce coste y mejora la precisión de selección cuando el
 * catálogo es grande, sin perder capacidades (el executor las maneja todas igualmente).
 */
export function selectAgentTools(message: string, recent: string[] = []): AiToolDefinition[] {
  const text = (message + ' ' + recent.join(' ')).toLowerCase();
  const areas = new Set<string>(DEFAULT_AREAS);
  for (const [area, kws] of Object.entries(AREA_KEYWORDS)) {
    if (kws.some((k) => text.includes(k))) areas.add(area);
  }
  return AGENT_TOOLS.filter((t) => {
    const area = TOOL_AREAS[t.name];
    return CORE_TOOLS.has(t.name) || !area || areas.has(area);
  });
}
