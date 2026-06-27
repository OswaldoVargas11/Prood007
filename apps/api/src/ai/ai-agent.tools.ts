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
  {
    name: 'convert_lead_to_client',
    description:
      'CONVIERTE un lead en cliente del despacho y crea un expediente opcional (acción de ESCRITURA, ' +
      'reversible). Úsala SOLO cuando el usuario pida explícitamente convertir, cerrar o dar de alta un ' +
      'prospecto. El lead debe tener un identificador fiscal válido (NIF/CIF/NIE en ES, RNC/Cédula en RD) ' +
      'que se valida automáticamente contra la jurisdicción del despacho; si no es válido, el sistema lo ' +
      'rechaza indicando el motivo. Si el usuario trabaja en ambas jurisdicciones (ES + RD), se intenta ' +
      'con la otra si falla la primera. Tras convertirlo, confirma al usuario el nombre del cliente, el ' +
      'identificador fiscal y si se creó el expediente asociado. El lead queda marcado CONVERTED y ya no ' +
      'se puede convertir de nuevo.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID del lead/prospecto a convertir (requerido).',
        },
        taxId: {
          type: 'string',
          description:
            'Identificador fiscal válido en la jurisdicción del despacho: NIF/CIF/NIE (España) o ' +
            'RNC/Cédula (República Dominicana). Se normaliza automáticamente.',
        },
        docType: {
          type: 'string',
          enum: ['PASSPORT', 'OTHER'],
          description:
            'Tipo de documento si el cliente es extranjero. PASSPORT o OTHER activa validación ligera ' +
            '(si se omite, validación fiscal estricta de la jurisdicción).',
        },
        createMatter: {
          type: 'boolean',
          description:
            'Si true, crea automáticamente un expediente vinculado al nuevo cliente (opcional; por defecto false).',
        },
        matterTitle: {
          type: 'string',
          description:
            'Título del expediente si createMatter=true (opcional; si se omite usa el asunto del lead o un valor por defecto).',
        },
        matterType: {
          type: 'string',
          description:
            'Tipo de asunto del expediente si createMatter=true (opcional; si se omite usa "Consulta").',
        },
      },
      required: ['leadId', 'taxId'],
    },
  },
  {
    name: 'update_lead',
    description:
      'ACTUALIZA un lead del embudo de captación (acción de ESCRITURA, reversible). Cambia estado (NEW → CONTACTED → QUALIFIED → CONVERTED/LOST), contacto (email/teléfono), asignación a un letrado, valor estimado o notas. Útil para nutrición del pipeline: mover leads entre etapas, actualizar datos de contacto o reasignar prospecto. Tras actualizar, confirma al usuario los cambios realizados.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID único del lead a actualizar (requerido).',
        },
        status: {
          type: 'string',
          enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'],
          description:
            'Nuevo estado en el embudo (opcional; NEW, CONTACTED, QUALIFIED, CONVERTED o LOST).',
        },
        name: {
          type: 'string',
          description: 'Nombre del prospecto (opcional; 2-200 caracteres).',
        },
        email: {
          type: 'string',
          description: 'Email de contacto (opcional; formato válido).',
        },
        phone: {
          type: 'string',
          description: 'Teléfono de contacto (opcional; máximo 40 caracteres).',
        },
        company: {
          type: 'string',
          description: 'Empresa/razón social del prospecto (opcional; máximo 200 caracteres).',
        },
        subject: {
          type: 'string',
          description: 'Asunto de interés / tipo de consulta (opcional; máximo 500 caracteres).',
        },
        estimatedValue: {
          type: 'number',
          description: 'Valor estimado en EUR de la oportunidad (opcional; positivo).',
        },
        notes: {
          type: 'string',
          description: 'Notas internas sobre el prospecto (opcional; máximo 5000 caracteres).',
        },
        assignedToId: {
          type: 'string',
          description:
            'ID del letrado al que asignar el lead (opcional; debe existir en el despacho).',
        },
        source: {
          type: 'string',
          description:
            "Origen del lead: 'manual', 'intake', 'linkedin', 'referral', etc. (opcional).",
        },
      },
      required: ['leadId'],
    },
  },
  {
    name: 'get_client_kyc',
    description:
      'Obtiene el perfil KYC/AML de un cliente: estado de diligencia, nivel de riesgo, verificación de identidad, marca PEP, sanciones y notas de revisión. Devuelve null si la diligencia aún no se ha iniciado. Útil para "¿cuál es el perfil AML del cliente X?", "¿es PEP?", "¿riesgo alto?" o revisar el estado de cumplimiento.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'ID único del cliente en el sistema.' },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'upsert_client_kyc',
    description:
      'CREA o ACTUALIZA el perfil KYC/AML de un cliente (área=kyc, acceso=write). Registra estado de ' +
      'diligencia, nivel de riesgo, condición PEP, verificaciones (identidad, sanciones) y notas. ' +
      'Sella automáticamente el revisor (user) y la fecha. Úsala SOLO cuando el usuario pida crear o ' +
      'actualizar el perfil KYC de un cliente (p. ej. "marca este cliente como PEP", "aprueba KYC", ' +
      '"actualiza el riesgo a ALTO"). Tras hacerlo, confirma al usuario el estado final del perfil.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'ID único del cliente en el sistema (su clave primaria).',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'],
          description:
            'Estado de la diligencia KYC (opcional): PENDING, IN_REVIEW, APPROVED o REJECTED.',
        },
        risk: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'Nivel de riesgo AML (opcional): LOW, MEDIUM o HIGH.',
        },
        isPep: {
          type: 'boolean',
          description: 'Marca PEP (Personaje Expuesto Públicamente) (opcional).',
        },
        identityVerified: {
          type: 'boolean',
          description: 'Si la identidad del cliente ha sido verificada (opcional).',
        },
        sanctionsChecked: {
          type: 'boolean',
          description: 'Si se ha verificado contra listas de sanciones (opcional).',
        },
        notes: {
          type: 'string',
          description: 'Notas y observaciones del revisor (opcional; máximo 4000 caracteres).',
        },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'list_appointments_for_lawyer',
    description:
      'Lista las citas/reuniones FUTURAS del letrado autenticado: con clientes, expedientes asociados y estado. ' +
      'Excluye citas canceladas. Ordenadas por hora de inicio. Útil para "¿cuál es mi agenda?", "próximas reuniones" ' +
      'o "citas con cliente X".',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'confirm_appointment',
    description:
      'CONFIRMA una cita pendiente del calendario (acción de ESCRITURA, reversible). Cambia el estado ' +
      'REQUESTED → CONFIRMED. Úsala SOLO cuando el abogado pida confirmar/aprobar una cita que el cliente ' +
      'ha solicitado. Tras confirmarla, remite al cliente notificación automática de la confirmación.',
    inputSchema: {
      type: 'object',
      properties: {
        appointmentId: {
          type: 'string',
          description: 'ID único de la cita a confirmar (requerido).',
        },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'cancel_appointment',
    description:
      'CANCELA una cita futura del cliente con el abogado (acción de ESCRITURA, reversible). ' +
      'Útil cuando el cliente o abogado necesita cancelar una cita ya reservada. La acción es reversible: ' +
      'puede reactivarse en el futuro. El cliente es notificado automáticamente de la cancelación. ' +
      'Úsala SOLO cuando el usuario pida explícitamente cancelar una cita; tras cancelarla, confirma ' +
      'la cita cancelada y la fecha original.',
    inputSchema: {
      type: 'object',
      properties: {
        appointmentId: {
          type: 'string',
          description: 'ID único de la cita a cancelar (requerido).',
        },
      },
      required: ['appointmentId'],
    },
  },
  {
    name: 'list_saved_views',
    description:
      'Lista los filtros guardados (vistas/presets) del usuario en un ámbito específico (invoices, tasks o matters). Devuelve nombre y configuración de filtros.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['invoices', 'tasks', 'matters'],
          description: 'Ámbito de las vistas guardadas a listar.',
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'get_email_snippets',
    description:
      'Lista las plantillas de correo reutilizables guardadas en el despacho (respuestas, notificaciones, ' +
      'comunicados estándar). Devuelve nombre, asunto opcional y cuerpo de cada plantilla. Úsala para ' +
      '"¿qué plantillas de correo tengo?", "busca plantillas de X" o cuando el usuario quiera reutilizar ' +
      'una comunicación que ya existe para sugerir borradores con tono consistente. Lectura pura, sin ' +
      'modificaciones.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_data_rooms',
    description:
      'Lista los data rooms (espacios de due diligence) de un expediente, mostrando cuántos ' +
      'documentos, grupos de acceso (grants) y preguntas tiene cada sala. Útil para "¿qué data rooms ' +
      'tengo en este expediente?", "¿cuántos documentos en cada sala?" o "estado de due diligence".',
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
    name: 'create_data_room_grant',
    description:
      'CREA un enlace mágico de acceso externo (grant) en una sala de datos: genera un token seguro ' +
      'que permite acceso sin cuenta a un usuario externo (contraparte, asesor, auditor). El token se ' +
      'devuelve EN CLARO una sola vez: guárdalo y comparte con el usuario. Puedes limitar por ' +
      'carpetas, permitir/prohibir descarga e indicar expiración. La acción es REVERSIBLE (revoke). ' +
      'Úsala cuando el usuario diga "genera un enlace", "invita a la sala", "crea acceso externo".',
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único de la sala de datos en la que crear el enlace.',
        },
        email: {
          type: 'string',
          description:
            'Correo del usuario externo que recibirá el enlace (p. ej. buyer@example.com).',
        },
        name: {
          type: 'string',
          description:
            'Nombre del usuario externo para referencia (opcional; p. ej. "Juan Comprador").',
        },
        groupId: {
          type: 'string',
          description:
            'ID del grupo de permisos a que se adscribe (opcional). Hereda carpetas y descarga del grupo.',
        },
        canDownload: {
          type: 'boolean',
          description:
            'Permitir descarga de documentos (true por defecto). Si false, solo lectura en línea.',
        },
        folderIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array de IDs de carpetas permitidas (opcional). Vacío = acceso a toda la sala o hereda del grupo.',
        },
        expiresInDays: {
          type: 'integer',
          description:
            'Días hasta expiración del enlace (1-365; opcional). Sin indicar = permanente.',
        },
      },
      required: ['roomId', 'email'],
    },
  },
  {
    name: 'answer_data_room_question',
    description:
      'RESPONDE una pregunta de due diligence en la sala de datos (acción de ESCRITURA, reversible). ' +
      'El despacho contesta la DDQ (pregunta) que hizo la contraparte/externo a través del enlace mágico. ' +
      'Úsala SOLO cuando el usuario pida responder, contestar o aclarar una pregunta pendiente de la sala. ' +
      'Tras responder, confirma el ID de la pregunta, la respuesta y que está marcada como ANSWERED.',
    inputSchema: {
      type: 'object',
      properties: {
        questionId: {
          type: 'string',
          description: 'ID único de la pregunta a responder.',
        },
        answer: {
          type: 'string',
          description: 'Texto de la respuesta a la pregunta (1-8000 caracteres).',
        },
      },
      required: ['questionId', 'answer'],
    },
  },
  {
    name: 'download_data_room_document_internal',
    description:
      'Descarga un documento del data room (staff, sin marca de agua). Solo lectura. Acceso interno a documentos de due diligence; no incluye marca de agua confidencial.',
    inputSchema: {
      type: 'object',
      properties: {
        docId: {
          type: 'string',
          description: 'ID único del documento en el data room a descargar.',
        },
      },
      required: ['docId'],
    },
  },
  {
    name: 'add_transaction_party',
    description:
      'AGREGA UNA PARTE a una operación (transacción, M&A, etc.) del expediente. Especifica el lado ' +
      '(comprador, vendedor, etc.), rol (principal, asesor legal, etc.), nombre y contacto. Acción de ' +
      'ESCRITURA reversible (existe remove_transaction_party). Registra automáticamente los actores ' +
      'identificados en el sistema. Úsala SOLO cuando el usuario pida añadir, crear o registrar una parte ' +
      'nueva a una operación (p. ej. "añade al vendedor", "registra a los asesores", "agrega las partes de ' +
      'este M&A").',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
        name: {
          type: 'string',
          description: 'Nombre de la parte (1-200 caracteres; p. ej. "Acme Corp", "Juan Pérez").',
        },
        side: {
          type: 'string',
          enum: ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'],
          description:
            'Lado de la parte en la transacción (comprador, vendedor, empresa, prestamista, prestatario u otro).',
        },
        role: {
          type: 'string',
          enum: ['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'],
          description:
            'Rol de la parte: principal, asesor legal, asesor financiero, notaría u otro.',
        },
        organization: {
          type: 'string',
          description: 'Organización/empresa a la que pertenece (opcional; máximo 200 caracteres).',
        },
        email: {
          type: 'string',
          description: 'Correo electrónico de contacto (opcional; validado como email).',
        },
        phone: {
          type: 'string',
          description: 'Teléfono de contacto (opcional; máximo 50 caracteres).',
        },
        notes: {
          type: 'string',
          description: 'Notas internas sobre la parte (opcional; máximo 2000 caracteres).',
        },
        isDistribution: {
          type: 'boolean',
          description: 'Indica si la parte está en lista de distribución de documentos (opcional).',
        },
      },
      required: ['matterReference', 'name', 'side', 'role'],
    },
  },
  {
    name: 'update_transaction_party',
    description:
      'ACTUALIZA datos de una parte en una operación de M&A (acción de ESCRITURA, reversible). ' +
      'Modifica nombre, organización, correo, teléfono, rol, lado de la negociación y notas de una ' +
      'parte existente. Úsala SOLO cuando el usuario pida cambiar los detalles de una parte ya creada ' +
      '(p. ej. "actualiza el email del vendedor", "cambia el nombre de la parte contraria", "añade ' +
      'notas sobre el asesor legal"). Tras actualizar, confirma los datos modificados de la parte.',
    inputSchema: {
      type: 'object',
      properties: {
        partyId: {
          type: 'string',
          description: 'ID único de la parte a actualizar (identificador en el sistema).',
        },
        name: {
          type: 'string',
          description: 'Nuevo nombre de la parte (1-200 caracteres; opcional).',
        },
        organization: {
          type: 'string',
          description:
            'Nueva organización/empresa de la parte (hasta 200 caracteres; opcional). Vacío = desvincular.',
        },
        email: {
          type: 'string',
          description: 'Nuevo correo electrónico (formato válido, hasta 200 caracteres; opcional).',
        },
        phone: {
          type: 'string',
          description: 'Nuevo teléfono (hasta 50 caracteres; opcional).',
        },
        side: {
          type: 'string',
          enum: ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'],
          description:
            'Lado de la parte en la operación (BUYER, SELLER, COMPANY, LENDER, BORROWER, OTHER; opcional).',
        },
        role: {
          type: 'string',
          enum: ['PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER'],
          description:
            'Rol de la parte (PRINCIPAL, LEGAL_COUNSEL, FINANCIAL_ADVISOR, NOTARY, OTHER; opcional).',
        },
        notes: {
          type: 'string',
          description:
            'Notas adicionales sobre la parte (hasta 2000 caracteres; opcional). Vacío = limpiar.',
        },
      },
      required: ['partyId'],
    },
  },
  {
    name: 'get_transaction_milestones',
    description:
      'Obtiene los hitos clave de una operación transaccional (firma, cierre, longstop) con fechas, ' +
      'estados y notas. Hitos: SIGNING (firma de contratos), CLOSING (consumación), LONGSTOP (drop-dead ' +
      'date), CONDITIONS_DEADLINE (plazo para satisfacer condiciones), FUNDS_FLOW (transferencia de fondos), ' +
      'FILING (presentación registral) y CUSTOM. Estados: PENDING, DONE, MISSED. Útil para "¿cuál es el ' +
      'calendario de la operación?", "¿qué hito falta?", "¿se cumplió la fecha de cierre?" o "timeline del ' +
      'deal".',
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
    name: 'add_transaction_milestone',
    description:
      'CREA un hito (fecha crítica) en una operación/transacción (acción de ESCRITURA, reversible). ' +
      'Úsala SOLO cuando el usuario pida crear, agendar o añadir un hito de firma (SIGNING), cierre ' +
      '(CLOSING), fecha tope (LONGSTOP) u otro hito personalizado (CUSTOM) en un expediente de operación. ' +
      'Especifica el tipo de hito, fecha objetivo y opcionalmente notas. Tras crearlo, confirma al usuario ' +
      'el hito, su tipo y la fecha acordada.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente de operación (p. ej. EXP-2026-0042).',
        },
        kind: {
          type: 'string',
          enum: [
            'SIGNING',
            'CLOSING',
            'LONGSTOP',
            'CONDITIONS_DEADLINE',
            'FUNDS_FLOW',
            'FILING',
            'CUSTOM',
          ],
          description:
            'Tipo de hito: SIGNING (firma), CLOSING (cierre), LONGSTOP (fecha tope), CONDITIONS_DEADLINE ' +
            '(vencimiento de condiciones), FUNDS_FLOW (flujo de fondos), FILING (presentación/registro) o ' +
            'CUSTOM (personalizado).',
        },
        title: {
          type: 'string',
          description: 'Título/descripción del hito (2-200 caracteres; p. ej. "Firma de la SPA").',
        },
        targetDate: {
          type: 'string',
          description: 'Fecha objetiva del hito en formato YYYY-MM-DD (fecha crítica acordada).',
        },
        notes: {
          type: 'string',
          description: 'Notas adicionales o contexto del hito (opcional; máximo 2000 caracteres).',
        },
      },
      required: ['matterReference', 'kind', 'title', 'targetDate'],
    },
  },
  {
    name: 'update_transaction_milestone',
    description:
      'ACTUALIZA un hito de operación transaccional (M&A, inmobiliario, etc.): cambia su fecha ' +
      'de vencimiento (targetDate) y/o su estado (PENDING → DONE → MISSED). Acción de ESCRITURA, ' +
      'reversible. Útil para registrar que se cumplió una fecha clave (firma, cierre, longstop) ' +
      'o para corregir una fecha que cambió. Úsala SOLO cuando el usuario pida actualizar un hito ' +
      'específico (p. ej. "marca como completado el hito de firma", "cambia la fecha de cierre ' +
      'a ...", "corrige la longstop"). Tras actualizar, confirma al usuario el hito, su nuevo ' +
      'estado y fecha.',
    inputSchema: {
      type: 'object',
      properties: {
        milestoneId: {
          type: 'string',
          description: 'ID del hito de operación a actualizar.',
        },
        targetDate: {
          type: 'string',
          description: 'Nueva fecha de vencimiento en formato YYYY-MM-DD (opcional).',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'DONE', 'MISSED'],
          description:
            'Nuevo estado del hito: PENDING (abierto), DONE (completado), MISSED (no cumplido).',
        },
        title: {
          type: 'string',
          description: 'Nuevo título del hito (opcional; 2-200 caracteres).',
        },
        notes: {
          type: 'string',
          description: 'Notas adicionales (opcional, hasta 2000 caracteres).',
        },
      },
      required: ['milestoneId'],
    },
  },
  {
    name: 'update_disclosure_schedule',
    description:
      'ACTUALIZA un disclosure schedule existente en una operación (acción de ESCRITURA, reversible). Edita número, reserva de garantía, título, descripción, documento vinculado y estado (DRAFT→AGREED). Útil para "actualizar el schedule de disclosure X", "cambiar el estado a acordado" o "añadir un documento al schedule". Tras actualizar, confirma al usuario qué campos se modificaron.',
    inputSchema: {
      type: 'object',
      properties: {
        disclosureId: {
          type: 'string',
          description: 'ID único del disclosure schedule a actualizar (requerido).',
        },
        number: {
          type: 'string',
          description:
            "Número/código del schedule (p. ej. 'A.1', 'B.2.3'; máximo 40 caracteres, opcional).",
        },
        repWarranty: {
          type: 'string',
          description:
            'Referencia a la garantía de representación relacionada (máximo 200 caracteres, opcional).',
        },
        title: {
          type: 'string',
          description:
            "Título del schedule (p. ej. 'Permits and Licenses'; máximo 300 caracteres, opcional).",
        },
        body: {
          type: 'string',
          description:
            'Descripción completa del contenido del schedule (máximo 20000 caracteres, opcional).',
        },
        documentId: {
          type: 'string',
          description:
            "ID del documento vinculado, o vacío '' para desvincularlo (máximo 60 caracteres, opcional).",
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'AGREED'],
          description:
            'Estado del schedule: DRAFT (borrador) o AGREED (acordado en negociación, opcional).',
        },
      },
      required: ['disclosureId'],
    },
  },
  {
    name: 'get_registry_filings',
    description:
      'Obtiene las presentaciones registrales (filings) de una operación: tipo de registro, estado PENDING/SUBMITTED/REGISTERED/REJECTED, fechas de presentación y registro, código de referencia. Útil para "¿qué trámites registrales faltan?", "seguimiento de presentaciones" o "¿está registrado en el Registro Mercantil?". Lectura pura, acotada por expediente.',
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
    name: 'update_registry_filing',
    description:
      'ACTUALIZA una presentación registral en la operación (acción de ESCRITURA, reversible). Cambia el estado (PENDING → SUBMITTED → REGISTERED/REJECTED) y los datos asociados: referencias, fechas de envío/registro, notas y documentos. El sistema sella automáticamente submittedAt/registeredAt al cambiar de estado. Úsala SOLO cuando el usuario pida actualizar el estado de un registro, añadir referencias o cambiar datos de una presentación registral ya creada.',
    inputSchema: {
      type: 'object',
      properties: {
        filingId: {
          type: 'string',
          description: 'ID único de la presentación registral a actualizar.',
        },
        matterReference: {
          type: 'string',
          description:
            'Referencia del expediente donde está la presentación (se usa para validar contexto).',
        },
        registry: {
          type: 'string',
          enum: [
            'REGISTRO_MERCANTIL',
            'REGISTRO_PROPIEDAD',
            'INDICE_UNICO_NOTARIAL',
            'NOTARIA',
            'REGISTRO_TITULOS_RD',
            'CAMARA_COMERCIO_RD',
            'OTHER',
          ],
          description: "Tipo de registro (opcional; p. ej. 'REGISTRO_MERCANTIL', 'NOTARIA').",
        },
        title: {
          type: 'string',
          description: 'Título/nombre de la presentación (2-200 caracteres, opcional).',
        },
        referenceCode: {
          type: 'string',
          description:
            "Código o número de referencia en el registro (p. ej. 'T-123-F-456', opcional).",
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED'],
          description:
            'Nuevo estado de la presentación (PENDING, SUBMITTED, REGISTERED o REJECTED, opcional). Al cambiar a SUBMITTED/REGISTERED, el sistema sella automáticamente las fechas.',
        },
        notes: {
          type: 'string',
          description:
            'Observaciones/anotaciones sobre la presentación (opcional; máximo 2000 caracteres).',
        },
        documentId: {
          type: 'string',
          description:
            'ID del documento asociado (opcional; se valida que pertenezca al mismo tenant).',
        },
        sortOrder: {
          type: 'integer',
          description: 'Orden de visualización en la lista (opcional).',
        },
      },
      required: ['filingId', 'matterReference'],
    },
  },
  {
    name: 'get_engagement_letter',
    description:
      'Obtiene la hoja de encargo (intake) del expediente: alcance del trabajo, honorarios y términos. ' +
      'Úsala para revisar los términos del encargo, verificar qué se incluyó en el alcance inicial o ' +
      'consultar la tarifa acordada. Devuelve scope, fees, terms y metadatos de la hoja generada (si existe).',
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
    name: 'save_engagement_letter',
    description:
      'CREA o ACTUALIZA la hoja de encargo (alcance, honorarios, términos) del expediente y genera un ' +
      'PDF con la marca del despacho listo para firma (acción de ESCRITURA, reversible). Úsala SOLO ' +
      'cuando el usuario pida formalizar el encargo de un expediente. El PDF se guarda automáticamente ' +
      'como documento del expediente con estado GENERATED. Tras generarla, confirma al usuario el ' +
      'expediente, alcance resumido y que queda pendiente de firma.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia exacta del expediente donde guardar la hoja de encargo (p. ej. EXP-2026-0042).',
        },
        scope: {
          type: 'string',
          description:
            'Alcance del encargo: descripción del trabajo que se va a realizar (mínimo 1, máximo 8000 caracteres).',
        },
        fees: {
          type: 'string',
          description:
            'Estructura de honorarios: tarifa, sistema de cobro, retenciones, gastos (mínimo 1, máximo 8000 caracteres).',
        },
        terms: {
          type: 'string',
          description:
            'Términos y condiciones: plazo de ejecución, forma de pago, terminación del encargo, confidencialidad (mínimo 1, máximo 8000 caracteres).',
        },
      },
      required: ['matterReference', 'scope', 'fees', 'terms'],
    },
  },
  {
    name: 'get_company_secretary_overview',
    description:
      'Obtiene la vista completa de la secretaría de una sociedad por cliente: actas corporativas, accionistas/socios y transmisiones de participaciones, y obligaciones registrales (plazos de presentación en Registro Mercantil, Registro de la Propiedad, etc.). Úsala para "¿cómo va la secretaría de X?", "¿quiénes son los socios?", "¿qué obligaciones al Registro hay pendientes?" o gestionar gobernanza corporativa.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description:
            'ID único del cliente/sociedad. Se resuelve a partir de find_client o get_client_detail.',
        },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'add_shareholder',
    description:
      'AGREGA un accionista (socio) a una sociedad en la secretaría corporativa (acción de ESCRITURA, reversible). Proporciona el nombre del accionista, opcionalmente su identificador fiscal (NIF/RNC) y la participación en unidades. El registro queda en el libro de socios con historial completo para auditoría. Úsala SOLO cuando el usuario pida crear, registrar o dar de alta un nuevo socio en una sociedad/empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description:
            'ID de la sociedad/empresa donde agregar el accionista (debe existir en el despacho y pertenecer al tenant).',
        },
        name: {
          type: 'string',
          description: 'Nombre legal del accionista/socio (persona o empresa; 1-200 caracteres).',
        },
        taxId: {
          type: 'string',
          description:
            'Identificador fiscal opcional del accionista (NIF/CIF/NIE en ES, RNC/Cédula en RD; máximo 40 caracteres).',
        },
        units: {
          type: 'integer',
          description: 'Participación en unidades/acciones del accionista (número entero >= 0).',
        },
      },
      required: ['clientId', 'name', 'units'],
    },
  },
  {
    name: 'get_firm_settings',
    description:
      'Obtiene la configuración completa del despacho: datos del tenant (nombre, jurisdicción, plan, ' +
      'serie de facturación), puestos ocupados, total de clientes y expedientes, festivos locales y ' +
      'certificado digital. Lectura pura, sin cambios. Úsala para "¿cuál es la configuración del despacho?" ' +
      'o cuando necesites datos de la licencia, plan o series fiscales para contexto.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_firm_holiday',
    description:
      'AÑADE un día festivo local al calendario del despacho (acción de ESCRITURA, reversible). Los festivos afectan al cálculo de plazos procesales (p. ej. fechas límite, cálculo de naturaleza de los plazos). Úsala SOLO cuando el usuario pida explícitamente añadir o registrar un nuevo festivo local. Proporciona la fecha exacta en formato YYYY-MM-DD y un nombre descriptivo (p. ej. "Día de Reyes", "Festivo local municipal"). Tras añadirlo, confirma al usuario la fecha y el nombre del festivo registrado.',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Fecha del festivo en formato YYYY-MM-DD (obligatorio).',
        },
        name: {
          type: 'string',
          description: 'Nombre descriptivo del festivo (p. ej. "Día de Reyes"; 2-100 caracteres).',
        },
      },
      required: ['date', 'name'],
    },
  },
  {
    name: 'change_matter_status',
    description:
      'CAMBIA el estado de un expediente (acción de ESCRITURA, reversible). Valida la máquina de ' +
      'estados permitidas (OPEN→IN_PROGRESS, OPEN→ON_HOLD, OPEN→CLOSED, IN_PROGRESS→ON_HOLD, ' +
      'IN_PROGRESS→CLOSED, ON_HOLD→IN_PROGRESS, ON_HOLD→CLOSED, CLOSED→ARCHIVED, CLOSED→IN_PROGRESS). ' +
      'Registra automáticamente la transición en la cronología del expediente (timeline) y auditoría. ' +
      'Úsala SOLO cuando el usuario pida explícitamente cambiar, cerrar, abrir o poner en pausa un expediente ' +
      '(p. ej. "cierra este expediente", "abre de nuevo el EXP-2026-0042", "pausa este caso"). Tras ' +
      'cambiar el estado, confirma al usuario el expediente, el estado anterior y el nuevo.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
        status: {
          type: 'string',
          enum: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'ARCHIVED'],
          description:
            'Nuevo estado del expediente (OPEN, IN_PROGRESS, ON_HOLD, CLOSED o ARCHIVED). ' +
            'El sistema valida la transición según la máquina de estados.',
        },
      },
      required: ['matterReference', 'status'],
    },
  },
  {
    name: 'update_client_info',
    description:
      "ACTUALIZA los datos de un cliente del despacho (nombre, email, teléfono, dirección, identificador fiscal). Acción de ESCRITURA, reversible. Úsala SOLO cuando el usuario pida explícitamente actualizar, cambiar o editar datos de un cliente existente (p. ej. 'actualiza el nombre del cliente', 'cambia el email', 'corrige el número fiscal'). NO la uses para crear un cliente nuevo (usa create_client) ni para gestionar su acceso de portal. Tras actualizar, confirma al usuario los datos modificados.",
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'ID único del cliente a actualizar (requerido).',
        },
        name: {
          type: 'string',
          description:
            'Nuevo nombre del cliente (opcional; mínimo 2 caracteres si se proporciona).',
        },
        email: {
          type: 'string',
          description: 'Nuevo correo electrónico del cliente (opcional; formato válido).',
        },
        phone: {
          type: 'string',
          description: 'Nuevo teléfono de contacto (opcional; máximo 40 caracteres).',
        },
        address: {
          type: 'string',
          description: 'Nueva dirección postal del cliente (opcional; máximo 300 caracteres).',
        },
        taxId: {
          type: 'string',
          description:
            'Nuevo identificador fiscal válido en la jurisdicción del despacho: NIF/CIF/NIE (España) o RNC/Cédula (República Dominicana) (opcional). Se normaliza automáticamente.',
        },
        docType: {
          type: 'string',
          enum: ['PASSPORT', 'OTHER'],
          description:
            'Tipo de documento si el cliente es extranjero. PASSPORT o OTHER activa validación ligera (opcional; si se omite con taxId, validación fiscal estricta de la jurisdicción).',
        },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'export_client_gdpr',
    description:
      'RGPD/Ley 172-13 — DERECHO DE ACCESO Y PORTABILIDAD: exporta todos los datos del cliente en un objeto estructurado (datos personales, expedientes, documentos, tareas, movimientos contables, facturas y mensajes). Solo FIRM_ADMIN. El contenido binario de los documentos se descarga aparte (autenticado). Queda traza en AuditLog. Acotado al tenant del usuario.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'ID único del cliente cuyo RGPD exportar (requerido).',
        },
      },
      required: ['clientId'],
    },
  },
  {
    name: 'list_leads',
    description:
      'Lista leads/prospectos del embudo filtrados por estado (NEW/CONTACTED/QUALIFIED/CONVERTED/LOST). Cada lead muestra nombre, contacto, empresa, asunto, valor estimado, letrado asignado y fecha de creación. Útil para "¿qué leads tengo?", "prospectos nuevos", "conversiones del mes" o gestión del pipeline de captación.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'],
          description:
            'Estado del lead en el embudo: NEW (nuevos), CONTACTED (contactados), QUALIFIED (cualificados), CONVERTED (convertidos a cliente) o LOST (perdidos). Opcional; sin indicar se devuelven todos.',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_lead',
    description:
      'CREA un prospecto (lead) nuevo en el embudo de captación (acción de ESCRITURA, reversible). Úsala SOLO cuando el usuario pida explícitamente crear, añadir o registrar un nuevo prospecto/oportunidad. El lead entra en estado NEW y puede moverse por el embudo (NEW → CONTACTED → QUALIFIED → CONVERTED/LOST) según avance. Opcionalmente asigna el prospecto a un letrado responsable de seguimiento. Tras crearlo, confirma al usuario el nombre, datos de contacto y letrado asignado.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Nombre del prospecto (empresa, persona o razón social; 2-200 caracteres, obligatorio).',
        },
        email: {
          type: 'string',
          description: 'Email de contacto del prospecto (opcional; formato válido).',
        },
        phone: {
          type: 'string',
          description: 'Teléfono de contacto (opcional; máximo 40 caracteres).',
        },
        company: {
          type: 'string',
          description: 'Empresa/razón social del prospecto (opcional; máximo 200 caracteres).',
        },
        subject: {
          type: 'string',
          description: 'Asunto de interés / tipo de consulta (opcional; máximo 500 caracteres).',
        },
        notes: {
          type: 'string',
          description: 'Notas internas sobre el prospecto (opcional; máximo 2000 caracteres).',
        },
        source: {
          type: 'string',
          description:
            "Origen del lead: 'manual', 'intake', 'linkedin', 'referral', 'web', etc. (opcional; por defecto 'manual').",
        },
        estimatedValue: {
          type: 'number',
          description: 'Valor estimado en EUR de la oportunidad (opcional; positivo).',
        },
        assignedToId: {
          type: 'string',
          description:
            'ID del letrado al que asignar el lead para seguimiento (opcional; debe existir en el despacho).',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_matter_team',
    description:
      'Obtiene el equipo asignado a un expediente: letrado responsable/líder + miembros adicionales. ' +
      'Útil para verificar quiénes participan en un caso. Lectura pura.',
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
    name: 'reassign_task',
    description:
      'REASIGNA una tarea existente a otro letrado del despacho para balancear la carga de trabajo (acción de ESCRITURA, reversible). Úsala SOLO cuando el usuario pida reasignar, transferir o pasar una tarea a otro letrado. Tras reasignarla, confirma al usuario la tarea, el antiguo responsable y el nuevo asignado.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID único de la tarea a reasignar (requerido).',
        },
        lawyerId: {
          type: 'string',
          description:
            'ID del letrado al que reasignar la tarea (requerido; debe ser usuario LAWYER o FIRM_ADMIN del despacho).',
        },
        reason: {
          type: 'string',
          description: 'Motivo de la reasignación (opcional; para auditoría).',
        },
      },
      required: ['taskId', 'lawyerId'],
    },
  },
  {
    name: 'create_saved_view',
    description:
      'GUARDA un preset de filtros (vista personalizada) para acceso rápido. Útil para expedientes abiertos, tareas urgentes, facturas vencidas u otros filtros frecuentes. La vista queda privada para el usuario (no compartida). Acción reversible: se puede eliminar. Úsala SOLO cuando el usuario pida guardar, crear o nombrar un filtro que use actualmente.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['invoices', 'tasks', 'matters'],
          description:
            'Ámbito de la vista: invoices (facturas), tasks (tareas) o matters (expedientes).',
        },
        name: {
          type: 'string',
          description:
            'Nombre descriptivo del preset (1-80 caracteres; p. ej. "Tareas urgentes", "Expedientes abiertos").',
        },
        filters: {
          type: 'object',
          description:
            'Objeto opaco con los filtros (estado, etiquetas, cliente, etc.) que define la vista. Formato JSON.',
        },
      },
      required: ['scope', 'name', 'filters'],
    },
  },
  {
    name: 'list_document_packages',
    description:
      "Lista los paquetes de plantillas configurados en el despacho (sets pre-armados de documentos reutilizables). Devuelve nombre e IDs de las plantillas incluidas en cada paquete. Útil para 'Qué paquetes de documentos tenemos?', 'Aplica el paquete de X' o cuando el usuario quiera sugerir un paquete aplicable a un tipo de expediente. Solo lectura: no crea ni edita paquetes.",
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_document_folders',
    description:
      'Lista el árbol de carpetas de documentos de un expediente. Devuelve la estructura jerárquica (parentId) para que el frontend reconstruya el árbol. Útil para entender dónde organizar documentos nuevos, navegar la estructura de carpetas o sugerir en qué carpeta guardar un archivo.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia exacta del expediente (p. ej. EXP-2026-0042) del que listar carpetas.',
        },
      },
      required: ['matterReference'],
    },
  },
  {
    name: 'create_document_folder',
    description:
      'CREA una carpeta dentro de un expediente para organizar documentos generados por IA (acción de ESCRITURA, reversible). Especifica el nombre y opcionalmente la carpeta padre (para anidar). La carpeta queda vinculada al expediente y clasificada como DOCUMENT. Úsala SOLO cuando el usuario pida crear, añadir o registrar una carpeta nueva en un expediente. Tras crearla, confirma al usuario el nombre, el expediente y su referencia de almacenamiento.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia exacta del expediente donde crear la carpeta (p. ej. EXP-2026-0042).',
        },
        name: {
          type: 'string',
          description:
            "Nombre de la carpeta (1-200 caracteres; p. ej. 'Escritos IA', 'Documentación generada').",
        },
        parentFolderId: {
          type: 'string',
          description:
            'ID de la carpeta padre para anidar (opcional). Si se omite, la carpeta es raíz en el expediente.',
        },
      },
      required: ['matterReference', 'name'],
    },
  },
  {
    name: 'update_checklist_item',
    description:
      "MARCA un ítem de la checklist de presentación (UPLOADED/NA/PENDING) y opcionalmente vincula un documento (acción de ESCRITURA, reversible). Úsala SOLO cuando el usuario pida actualizar el estado de un requisito en una checklist (p. ej. 'marca este documento como aportado', 'vincula el archivo a este ítem', 'cambia el estado a NA'). Al vincular un documento sin indicar estado explícito, se marca automáticamente como UPLOADED. La acción es reversible: puedes cambiar el estado de vuelta o desvincular el documento (null).",
    inputSchema: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'ID único del ítem de la checklist a actualizar (requerido).',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'UPLOADED', 'NA'],
          description:
            'Nuevo estado del ítem (opcional): PENDING (pendiente), UPLOADED (documento aportado) o NA (no aplica/renunciado). Si se omite y se proporciona documentId, se marca automáticamente como UPLOADED.',
        },
        documentId: {
          type: 'string',
          description:
            'ID del documento a vincular al ítem (opcional). Si es null, se desvincula el documento existente. El documento se valida que pertenezca al mismo expediente.',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'link_document_to_data_room',
    description:
      "VINCULA una versión existente de un documento del expediente al data room como espejo (sin duplicar bytes en almacenamiento). La acción es REVERSIBLE: puede removerse el enlace posteriormente. Útil para reutilizar documentos ya cargados evitando duplicación. Úsala cuando el usuario pida 'añade este documento al data room', 'vincula el documento', o 'incluye en la sala de datos'.",
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único de la sala de datos en la que vincular el documento.',
        },
        versionId: {
          type: 'string',
          description:
            'ID de la versión del documento a vincular (debe existir en el expediente del despacho).',
        },
        folderId: {
          type: 'string',
          description:
            'ID de la carpeta dentro del data room donde ubicar el documento (opcional). Si se omite, se coloca en la raíz.',
        },
        name: {
          type: 'string',
          description:
            'Nombre alternativo del documento en el data room (opcional; máximo 200 caracteres). Si se omite, usa el nombre original del documento.',
        },
      },
      required: ['roomId', 'versionId'],
    },
  },
  {
    name: 'add_data_room_group',
    description:
      "CREA un grupo de permisos en una sala de datos (acción de ESCRITURA, reversible). Un grupo define qué carpetas puede ver un conjunto de usuarios externos (p. ej. 'Comprador y asesores', 'Vendedor') y si pueden descargar documentos. Los enlaces mágicos (grants) se adscriben al grupo y heredan sus permisos. Úsala SOLO cuando el usuario pida crear, añadir o registrar un nuevo grupo de permisos en una sala de datos. Tras crear el grupo, confirma el nombre, las carpetas permitidas y los permisos de descarga.",
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único de la sala de datos donde crear el grupo (requerido).',
        },
        name: {
          type: 'string',
          description:
            "Nombre del grupo (2-160 caracteres; p. ej. 'Comprador y asesores', 'Vendedor', 'Due diligence team').",
        },
        folderIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array de IDs de carpetas permitidas para este grupo (opcional). Vacío = acceso a toda la sala de datos. Máximo 200 carpetas.',
        },
        canDownload: {
          type: 'boolean',
          description:
            'Permitir descarga de documentos a los miembros de este grupo (true por defecto). Si false, solo lectura en línea.',
        },
      },
      required: ['roomId', 'name'],
    },
  },
  {
    name: 'revoke_data_room_grant',
    description:
      'REVOCA un enlace mágico de acceso a una sala de datos (lo marca como revocado, acción de ESCRITURA, reversible conceptualmente). Úsala SOLO cuando el usuario pida revocar, cancelar o desactivar el acceso de un usuario externo a través del enlace mágico. El usuario externo perderá acceso inmediatamente. Tras revocar, confirma al usuario el enlace revocado y la sala de datos.',
    inputSchema: {
      type: 'object',
      properties: {
        grantId: { type: 'string', description: 'ID del enlace/grant a revocar.' },
        roomId: { type: 'string', description: 'ID de la sala de datos (data room).' },
      },
      required: ['grantId'],
    },
  },
  {
    name: 'get_data_room_questions',
    description:
      "Lista todas las preguntas de due diligence (DDQ) de una sala de datos: preguntas hechas por externos, con estado (PENDING/ANSWERED), respuestas y fechas. Solo lectura. Útil para '¿qué preguntas tengo en la sala?', '¿cuáles están pendientes?' o auditar el progreso de due diligence.",
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único de la sala de datos de la que obtener las preguntas.',
        },
      },
      required: ['roomId'],
    },
  },
  {
    name: 'get_data_room_access_log',
    description:
      'Obtiene el log de accesos a una sala de datos (data room): quién accedió, cuándo, qué acción realizó. ' +
      'Devuelve los últimos 200 accesos ordenados por fecha (más recientes primero). Útil para auditar el ' +
      'uso de la sala, rastrear descargas o seguimiento de due diligence. Solo lectura; acotado al tenant.',
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único de la sala de datos (data room) cuyo log se quiere consultar.',
        },
      },
      required: ['roomId'],
    },
  },
  {
    name: 'get_transaction_parties',
    description:
      "Obtiene las partes de una operación transaccional (M&A, inmobiliaria, etc.) con sus roles y contactos: compradores, vendedores, asesores legales, notarios, etc. Devuelve nombre, organización, correo, teléfono, rol, lado de la negociación y notas de cada parte. Útil para '¿quiénes son los actores del deal?', '¿quién es el comprador/vendedor?', '¿contactos de las partes?' o revisar la estructura completa de la operación. Lectura pura, acotada por expediente.",
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
    name: 'add_disclosure_schedule',
    description:
      'CREA un disclosure schedule en una operación transaccional (M&A, inmobiliario, etc.) — acción ' +
      'de ESCRITURA, reversible (existe remove_disclosure_schedule). Especifica número/código del schedule ' +
      '(p. ej. "A.1", "B.2.3"), título, descripción completa (body), referencia a la garantía de representación ' +
      'que cubre (repWarranty, opcional), documento vinculado (opcional) y estado inicial (DRAFT o AGREED). ' +
      'Úsala SOLO cuando el usuario pida crear, añadir o registrar un nuevo disclosure schedule en una operación ' +
      '(p. ej. "crea el schedule A.1 de Permits", "añade un disclosure schedule", "registra los schedules de ' +
      'representaciones y garantías"). Tras crearlo, confirma el número, título y estado del schedule creado.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente de operación (p. ej. EXP-2026-0042).',
        },
        number: {
          type: 'string',
          description:
            'Número/código único del schedule (p. ej. "A.1", "B.2.3", "Schedule 1"; máximo 40 caracteres).',
        },
        title: {
          type: 'string',
          description:
            'Título/nombre descriptivo del schedule (p. ej. "Permits and Licenses"; máximo 300 caracteres).',
        },
        body: {
          type: 'string',
          description:
            'Descripción completa del contenido del disclosure schedule (máximo 20000 caracteres; puede incluir listados de excepciones, condiciones, etc.).',
        },
        repWarranty: {
          type: 'string',
          description:
            'Referencia a la representación o garantía que cubre este schedule (opcional; máximo 200 caracteres; p. ej. "Rep. 3.1 Compliance with Laws").',
        },
        documentId: {
          type: 'string',
          description:
            'ID del documento vinculado al schedule (opcional; máximo 60 caracteres; p. ej. un PDF de la lista de excepciones).',
        },
        status: {
          type: 'string',
          enum: ['DRAFT', 'AGREED'],
          description:
            'Estado inicial del schedule: DRAFT (borrador, por completar en negociación) o AGREED (acordado y cerrado).',
        },
      },
      required: ['matterReference', 'number', 'title', 'body'],
    },
  },
  {
    name: 'add_corporate_minute',
    description:
      'REGISTRA un acta de junta corporativa (GENERAL_MEETING, BOARD u OTHER) en el libro de actas de una ' +
      'sociedad (acción de ESCRITURA, reversible). Proporciona la fecha de la junta, el tipo, título y ' +
      'cuerpo del acta. El acta queda documentada en la secretaría de la sociedad con historial completo ' +
      'para auditoría y cumplimiento normativo. Úsala SOLO cuando el usuario pida registrar, crear o guardar ' +
      'un acta de junta general, junta directiva u otro órgano colegiado. Tras crearla, confirma al usuario ' +
      'la sociedad, fecha del acta y tipo de junta.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description:
            'ID de la sociedad/empresa donde registrar el acta (debe existir en el despacho y ' +
            'pertenecer al tenant). Se resuelve desde find_client o get_client_detail.',
        },
        kind: {
          type: 'string',
          enum: ['GENERAL_MEETING', 'BOARD', 'OTHER'],
          description:
            'Tipo de junta: GENERAL_MEETING (junta general de accionistas), BOARD (junta ' +
            'directiva/consejo de administración) u OTHER (otra asamblea corporativa). Opcional, ' +
            'por defecto GENERAL_MEETING.',
        },
        title: {
          type: 'string',
          description:
            'Título/asunto del acta (2-200 caracteres; p. ej. "Junta General Ordinaria 2026", ' +
            '"Sesión de Consejo de Administración 15/06/2026").',
        },
        meetingDate: {
          type: 'string',
          description:
            'Fecha de celebración de la junta en formato YYYY-MM-DD (fecha de la reunión, no de ' +
            'registro).',
        },
        body: {
          type: 'string',
          description:
            'Cuerpo/contenido completo del acta: orden del día, acuerdos, votos, decisiones ' +
            'corporativas (mínimo 1, máximo 20000 caracteres). Registra las resoluciones adoptadas.',
        },
      },
      required: ['clientId', 'title', 'meetingDate', 'body'],
    },
  },
  {
    name: 'assign_matter_lawyer',
    description:
      'Asigna o reasigna el letrado responsable de un expediente (solo administrador del despacho). Solo FIRM_ADMIN puede ejecutar. Reversible: puedes reasignarlo sin consecuencias. Usa esta herramienta cuando el usuario pida cambiar quién es responsable de un expediente.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
        lawyerId: {
          type: 'string',
          description:
            'ID del letrado a asignar como responsable. Usa null o deja vacío para desasignar (quitar responsable).',
        },
      },
      required: ['matterReference', 'lawyerId'],
    },
  },
  {
    name: 'get_kyc_summary',
    description:
      'Resumen agregado KYC/AML: total de clientes en el despacho, conteos por estado (PENDING, IN_REVIEW, APPROVED, REJECTED), clientes de alto riesgo y PEPs. Úsala para el dashboard de cumplimiento normativo y "¿cómo está el AML?"',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_template_detail',
    description:
      'Obtiene el contenido completo de una plantilla por su ID: nombre, descripción, cuerpo de texto con campos combinables ({{merge_fields}}) y lista de tokens {{campo}} detectados. Útil para previsualizar la plantilla antes de usarla en un documento o expediente, para validar que tiene los campos necesarios, o para reutilizar su contenido en otros documentos. Úsala tras localizarla con list_templates o cuando necesites consultar el cuerpo exacto de una plantilla.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'ID único de la plantilla en el sistema (su clave primaria).',
        },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'get_closing_checklist_detail',
    description:
      'Obtiene el detalle completo de un checklist de cierre: todas las partidas organizadas ' +
      'por categoría (CONDITION_PRECEDENT, DELIVERABLE, SIGNATURE_PAGE, OTHER) en el orden ' +
      'correcto, con estado, fase, responsable, vencimiento y documentos vinculados. Útil ' +
      'para "¿cuál es el estado exacto del checklist X?", "¿qué partidas faltan?" o revisar ' +
      'el progreso detallado del cierre. Lectura pura.',
    inputSchema: {
      type: 'object',
      properties: {
        checklistId: {
          type: 'string',
          description: 'ID único del checklist de cierre a consultar (requerido).',
        },
      },
      required: ['checklistId'],
    },
  },
  {
    name: 'create_closing_checklist',
    description:
      "CREA un checklist de cierre en un expediente (acción de ESCRITURA, reversible). Aplica una plantilla integrada de cierre (compraventa de participaciones M&A, compraventa inmobiliaria, etc.) o lo crea vacío. Úsala SOLO cuando el usuario pida crear/instanciar un checklist de cierre, por ejemplo 'crear checklist de cierre M&A', 'instancia el checklist para la operación', 'crea un checklist vacío'. Tras crearlo, confirma el expediente, la plantilla (si aplica) y cuántas partidas se han precargado.",
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description:
            'Referencia exacta del expediente donde crear el checklist (p. ej. EXP-2026-0042).',
        },
        title: {
          type: 'string',
          description:
            "Título del checklist de cierre (2-160 caracteres; p. ej. 'Cierre de compraventa tecnológica').",
        },
        templateKey: {
          type: 'string',
          description:
            "Clave de la plantilla integrada a instanciar (opcional; si se omite, checklist vacío). Opciones: 'ma_share_purchase' (Compraventa de participaciones M&A), 'real_estate_purchase' (Compraventa inmobiliaria), u otras disponibles en el despacho.",
        },
      },
      required: ['matterReference', 'title'],
    },
  },
  {
    name: 'update_closing_item',
    description:
      "EDITA una partida (requisito) del checklist de cierre de un expediente (acción de ESCRITURA, reversible). Cambia el estado (PENDING/SATISFIED/WAIVED), marcas de depósito (escrow), asignación, título, detalles, fecha de vencimiento, responsable, documento vinculado u orden de presentación. Úsala SOLO cuando el usuario pida actualizar, editar o cambiar un item en un checklist de cierre existente (p. ej. 'marca esta partida como satisfecha', 'libera las firmas', 'cambia la responsabilidad', 'vincula el documento'). Tras actualizar, confirma el checklist, el ítem y los cambios realizados.",
    inputSchema: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'ID único de la partida (item) a actualizar (requerido).',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'SATISFIED', 'WAIVED'],
          description:
            'Nuevo estado del ítem (opcional): PENDING (pendiente), SATISFIED (cumplida), WAIVED (renunciada/dispensada).',
        },
        category: {
          type: 'string',
          enum: ['CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER'],
          description:
            'Categoría del ítem (opcional): CONDITION_PRECEDENT (condición precedente), DELIVERABLE (entregable), SIGNATURE_PAGE (hoja de firma) u OTHER (otro).',
        },
        phase: {
          type: 'string',
          description:
            "Fase procedural asociada (opcional; p. ej. 'Pre-cierre', 'Post-cierre', 'Fondos en depósito').",
        },
        title: {
          type: 'string',
          description: 'Título/nombre del ítem (opcional, 2-200 caracteres).',
        },
        detail: {
          type: 'string',
          description:
            'Descripción/detalle adicional del ítem (opcional; máximo 2000 caracteres). Vacío para desvincular.',
        },
        responsibleParty: {
          type: 'string',
          description:
            "Parte responsable de aportar/cumplir el ítem (opcional; p. ej. 'Vendedor', 'Comprador', 'Notario'). Vacío para limpiar.",
        },
        assigneeId: {
          type: 'string',
          description:
            'ID del miembro del despacho asignado a dar seguimiento (opcional). Vacío para desvincular.',
        },
        documentId: {
          type: 'string',
          description: 'ID del documento vinculado a este ítem (opcional). Vacío para desvincular.',
        },
        dueDate: {
          type: 'string',
          description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional). Vacío para limpiar.',
        },
        inEscrow: {
          type: 'boolean',
          description:
            'Si es true, marca el ítem como en depósito (retención hasta cierre). Si es false y estaba retenido, sella la fecha de liberación. Opcional.',
        },
        sortOrder: {
          type: 'integer',
          description: 'Posición de presentación en el checklist (opcional, número entero).',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'get_data_room',
    description:
      'Obtiene la estructura completa de una sala de datos: carpetas (estructura jerárquica), documentos, grupos de acceso (permisos), enlaces de acceso externos (grants con expiraciones y revocaciones), log de accesos recientes y preguntas de due diligence. Útil para auditar el estado, permisos y actividad de una sala de datos de due diligence completa. Solo lectura; acotado por tenant.',
    inputSchema: {
      type: 'object',
      properties: {
        dataRoomId: {
          type: 'string',
          description: 'ID único de la sala de datos a obtener.',
        },
      },
      required: ['dataRoomId'],
    },
  },
  {
    name: 'create_data_room',
    description:
      "CREA un data room (sala de due diligence) en un expediente, lo que permite abrir espacios seguros para intercambio de documentos e interacción con terceros (contraparte, asesor, auditor). Especifica el nombre y opcionalmente marca de agua para confidencialidad. Puedes añadir documentos, crear grupos de acceso y generar enlaces mágicos después. La acción es REVERSIBLE. Úsala cuando el usuario diga 'abre un data room', 'crea una sala de diligencia', 'prepara un espacio de due diligence'.",
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente (p. ej. EXP-2026-0042).',
        },
        name: {
          type: 'string',
          description:
            "Nombre descriptivo de la sala (2-160 caracteres; p. ej. 'Due Diligence - Fase 1', 'Sala Comprador').",
        },
        watermark: {
          type: 'boolean',
          description:
            'Mostrar marca de agua de confidencialidad en los PDFs descargados (true por defecto).',
        },
      },
      required: ['matterReference', 'name'],
    },
  },
  {
    name: 'add_data_room_folder',
    description:
      'CREA una carpeta dentro de un data room para organizar documentos por tipos (acción de ESCRITURA, reversible). Especifica el nombre y opcionalmente la carpeta padre (para anidar jerárquicamente). Útil para "crea una carpeta para Due Diligence", "añade una carpeta Financiero" o similar. Tras crearla, confirma al usuario el nombre, el data room y su referencia de almacenamiento.',
    inputSchema: {
      type: 'object',
      properties: {
        roomId: {
          type: 'string',
          description: 'ID único del data room donde crear la carpeta (requerido).',
        },
        name: {
          type: 'string',
          description:
            'Nombre de la carpeta (1-160 caracteres; p. ej. "Due Diligence", "Financiero", "Legales").',
        },
        parentId: {
          type: 'string',
          description:
            'ID de la carpeta padre para anidar (opcional). Si se omite, la carpeta es raíz en el data room.',
        },
      },
      required: ['roomId', 'name'],
    },
  },
  {
    name: 'get_disclosure_schedules',
    description:
      'Obtiene los disclosure schedules (reps & warranties documentadas) de una operación transaccional con sus estados (DRAFT/AGREED). Incluye número, título, garantía de representación, contenido, documento vinculado y estado de acuerdo. Útil para "¿qué disclosure schedules hay?", "¿cuál es el estado de los schedules?", "¿qué está acordado?" o "revisión de documentación de garantías". Lectura pura, acotada por expediente.',
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
    name: 'add_registry_filing',
    description:
      'REGISTRA una presentación registral en la operación (PROPERTY/COMMERCIAL/LABOR, etc.) — acción ' +
      'de ESCRITURA, reversible (existe remove_registry_filing). Especifica el tipo de registro ' +
      '(REGISTRO_MERCANTIL, REGISTRO_PROPIEDAD, NOTARIA, etc.), título descriptivo de la presentación, ' +
      'referencia en el registro (opcional) y documento asociado (opcional). La presentación queda en estado ' +
      'PENDING y se puede actualizar con update_registry_filing. Úsala SOLO cuando el usuario pida registrar, ' +
      'crear o dar de alta una nueva presentación registral en una operación (p. ej. "registra la presentación ' +
      'al Registro Mercantil", "añade un filing en la notaría", "crea una presentación de propiedad"). Tras ' +
      'crearla, confirma el tipo de registro, título y que queda pendiente de gestión.',
    inputSchema: {
      type: 'object',
      properties: {
        matterReference: {
          type: 'string',
          description: 'Referencia exacta del expediente de operación (p. ej. EXP-2026-0042).',
        },
        registry: {
          type: 'string',
          enum: [
            'REGISTRO_MERCANTIL',
            'REGISTRO_PROPIEDAD',
            'INDICE_UNICO_NOTARIAL',
            'NOTARIA',
            'REGISTRO_TITULOS_RD',
            'CAMARA_COMERCIO_RD',
            'OTHER',
          ],
          description:
            'Tipo de registro donde se hará la presentación (REGISTRO_MERCANTIL, REGISTRO_PROPIEDAD, NOTARIA, etc.; opcional, por defecto OTHER).',
        },
        title: {
          type: 'string',
          description:
            'Título/nombre descriptivo de la presentación (1-200 caracteres; p. ej. "Presentación de constitución", "Filing de transmisión de participaciones").',
        },
        referenceCode: {
          type: 'string',
          description:
            'Código o número de referencia en el registro (opcional; máximo 120 caracteres; p. ej. "T-123-F-456", "2026-5433-GCCO").',
        },
        documentId: {
          type: 'string',
          description:
            'ID del documento asociado (opcional; máximo 60 caracteres; se valida que pertenezca al mismo tenant; p. ej. PDF de la escritura presentada).',
        },
        notes: {
          type: 'string',
          description:
            'Observaciones/anotaciones sobre la presentación (opcional; máximo 2000 caracteres; p. ej. "Presentada ante Notaría Pérez el 25/06/2026").',
        },
      },
      required: ['matterReference', 'title'],
    },
  },
  {
    name: 'add_share_transfer',
    description:
      'REGISTRA una transmisión de participaciones/acciones en la sociedad (acción de ESCRITURA, reversible). Documenta los cambios de socios mediante transferencias: quién transmite, quién recibe, número de unidades, fecha y nota explicativa. Úsala SOLO cuando el usuario pida registrar, documentar o anotar una transmisión de participaciones en el libro de socios. Tras registrarla, confirma al usuario el traspaso documentado, los socios implicados y el nuevo reparto de unidades.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description:
            'ID único de la sociedad (client) donde registrar la transmisión (obligatorio).',
        },
        fromName: {
          type: 'string',
          description:
            'Nombre del socio/accionista que transmite (opcional; puede ser null para aportaciones).',
        },
        toName: {
          type: 'string',
          description:
            'Nombre del socio/accionista que recibe la transmisión (obligatorio; máximo 200 caracteres).',
        },
        units: {
          type: 'integer',
          description: 'Número de unidades/acciones transmitidas (obligatorio; mínimo 1).',
        },
        date: {
          type: 'string',
          description: 'Fecha de la transmisión en formato YYYY-MM-DD (obligatorio).',
        },
        note: {
          type: 'string',
          description:
            'Nota/comentario explicativo de la transmisión (opcional; máximo 2000 caracteres; p. ej. "Compraventa notarial", "Donación entre parientes").',
        },
      },
      required: ['clientId', 'toName', 'units', 'date'],
    },
  },
  {
    name: 'add_registry_obligation',
    description:
      'CREA una obligación registral recurrente en el libro de obligaciones de una sociedad (acción de ESCRITURA, reversible). Proporciona el tipo de registro (PROPERTY/COMMERCIAL/LABOR o similar), título descriptivo, opcionalmente un código de referencia, la fecha de vencimiento, y el tipo de recurrencia (ANNUAL para obligaciones que se repiten cada año, ONCE para única). Auto-genera automáticamente la del próximo año si es ANNUAL y se marca como FILED. Úsala SOLO cuando el usuario pida registrar, crear o añadir una nueva obligación registral recurrente. Tras crearla, confirma al usuario la sociedad, tipo de obligación, vencimiento y recurrencia.',
    inputSchema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description:
            'ID de la sociedad/empresa donde registrar la obligación (debe existir en el despacho y pertenecer al tenant). Se resuelve desde find_client o get_client_detail.',
        },
        registry: {
          type: 'string',
          enum: [
            'REGISTRO_MERCANTIL',
            'REGISTRO_PROPIEDAD',
            'INDICE_UNICO_NOTARIAL',
            'NOTARIA',
            'REGISTRO_TITULOS_RD',
            'CAMARA_COMERCIO_RD',
            'OTHER',
          ],
          description:
            'Tipo de registro: REGISTRO_MERCANTIL (RM), REGISTRO_PROPIEDAD (RP), INDICE_UNICO_NOTARIAL, NOTARIA, REGISTRO_TITULOS_RD, CAMARA_COMERCIO_RD u OTHER. Opcional.',
        },
        title: {
          type: 'string',
          description:
            "Título/descripción de la obligación registral (2-200 caracteres; p. ej. 'Cuentas anuales al Registro Mercantil', 'Declaración de dominical').",
        },
        referenceCode: {
          type: 'string',
          description:
            'Código de referencia opcional de la obligación (máximo 120 caracteres; p. ej. número de expediente, código fiscal).',
        },
        dueDate: {
          type: 'string',
          description:
            'Fecha de vencimiento de la obligación en formato YYYY-MM-DD (fecha de vencimiento de presentación/depósito).',
        },
        recurrence: {
          type: 'string',
          enum: ['ANNUAL', 'ONCE'],
          description:
            'Tipo de recurrencia: ANNUAL (se repite cada año; auto-genera la del próximo año al marcar FILED) u ONCE (única, sin repetición). Por defecto ANNUAL.',
        },
      },
      required: ['clientId', 'title', 'dueDate'],
    },
  },
  {
    name: 'update_registry_obligation',
    description:
      'ACTUALIZA una obligación registral de una sociedad (acción de ESCRITURA, reversible). Edita tipo de registro, título, vencimiento, recurrencia y estado de una obligación. Cuando marcas como FILED una obligación ANUAL, crea automáticamente la del próximo año en estado PENDING. Úsala SOLO cuando el usuario pida editar, cambiar estado o marcar como cumplida una obligación registral existente. Tras actualizarla, confirma al usuario los cambios realizados.',
    inputSchema: {
      type: 'object',
      properties: {
        obligationId: {
          type: 'string',
          description: 'ID único de la obligación a actualizar (requerido).',
        },
        registry: {
          type: 'string',
          enum: [
            'REGISTRO_MERCANTIL',
            'REGISTRO_PROPIEDAD',
            'INDICE_UNICO_NOTARIAL',
            'NOTARIA',
            'REGISTRO_TITULOS_RD',
            'CAMARA_COMERCIO_RD',
            'OTHER',
          ],
          description:
            'Tipo de registro/oficina: REGISTRO_MERCANTIL, REGISTRO_PROPIEDAD, INDICE_UNICO_NOTARIAL, NOTARIA, REGISTRO_TITULOS_RD, CAMARA_COMERCIO_RD u OTHER (opcional).',
        },
        title: {
          type: 'string',
          description: 'Título/descripción de la obligación (2-200 caracteres; opcional).',
        },
        referenceCode: {
          type: 'string',
          description:
            'Código de referencia interno de la obligación (opcional; máximo 120 caracteres).',
        },
        dueDate: {
          type: 'string',
          description: 'Fecha de vencimiento en formato YYYY-MM-DD (opcional).',
        },
        recurrence: {
          type: 'string',
          enum: ['NONE', 'ANNUAL'],
          description:
            'Recurrencia de la obligación: NONE (única) o ANNUAL (anual). Al marcar FILED con ANNUAL, crea automáticamente la del siguiente año (opcional).',
        },
        status: {
          type: 'string',
          enum: ['PENDING', 'FILED'],
          description:
            'Estado de la obligación: PENDING (pendiente) o FILED (cumplida/presentada). Al marcar FILED en una obligación ANUAL, el sistema crea automáticamente la del próximo año (opcional).',
        },
      },
      required: ['obligationId'],
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
  assign_matter_lawyer: 'matters',
  get_kyc_summary: 'kyc',
  get_template_detail: 'templates',
  get_closing_checklist_detail: 'closing',
  create_closing_checklist: 'closing',
  update_closing_item: 'closing',
  get_data_room: 'data-room',
  create_data_room: 'data-room',
  add_data_room_folder: 'data-room',
  get_disclosure_schedules: 'deal',
  add_registry_filing: 'deal',
  add_share_transfer: 'company-secretary',
  add_registry_obligation: 'company-secretary',
  update_registry_obligation: 'company-secretary',
  change_matter_status: 'matters',
  update_client_info: 'clients',
  export_client_gdpr: 'clients',
  list_leads: 'leads',
  create_lead: 'leads',
  get_matter_team: 'matters',
  reassign_task: 'tasks',
  create_saved_view: 'saved-views',
  list_document_packages: 'document-packages',
  list_document_folders: 'folders',
  create_document_folder: 'folders',
  update_checklist_item: 'presentations',
  link_document_to_data_room: 'data-room',
  add_data_room_group: 'data-room',
  revoke_data_room_grant: 'data-room',
  get_data_room_questions: 'data-room',
  get_data_room_access_log: 'data-room',
  get_transaction_parties: 'deal',
  add_disclosure_schedule: 'deal',
  add_corporate_minute: 'company-secretary',
  convert_lead_to_client: 'leads',
  update_lead: 'leads',
  get_client_kyc: 'kyc',
  upsert_client_kyc: 'kyc',
  list_appointments_for_lawyer: 'scheduling',
  confirm_appointment: 'scheduling',
  cancel_appointment: 'scheduling',
  list_saved_views: 'saved-views',
  get_email_snippets: 'email-snippets',
  list_data_rooms: 'data-room',
  create_data_room_grant: 'data-room',
  answer_data_room_question: 'data-room',
  download_data_room_document_internal: 'data-room',
  add_transaction_party: 'deal',
  update_transaction_party: 'deal',
  get_transaction_milestones: 'deal',
  add_transaction_milestone: 'deal',
  update_transaction_milestone: 'deal',
  update_disclosure_schedule: 'deal',
  get_registry_filings: 'deal',
  update_registry_filing: 'deal',
  get_engagement_letter: 'engagement',
  save_engagement_letter: 'engagement',
  get_company_secretary_overview: 'company-secretary',
  add_shareholder: 'company-secretary',
  get_firm_settings: 'settings',
  add_firm_holiday: 'settings',
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
