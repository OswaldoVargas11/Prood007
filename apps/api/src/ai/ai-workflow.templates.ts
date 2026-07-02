import type { WorkflowStep } from './ai-workflow.service';

/**
 * BIBLIOTECA de plantillas de flujos instalables (self-service, estilo Harvey/prefab agents pero para
 * pyme). A diferencia de `AiWorkflow` (definición del despacho, por tenant, en BD con RLS), una plantilla
 * es contenido CURADO y GLOBAL — igual que `AGENT_TOOLS` es un catálogo estático de código, no una tabla
 * por tenant. "Instalar" copia la plantilla al `AiWorkflow` del despacho, donde queda editable.
 *
 * Cada plantilla se compone SOLO con herramientas existentes del catálogo del agente. Los pasos van
 * ordenados con las LECTURAS primero y las ESCRITURAS después: el motor respeta el gate HITL (una
 * escritura sin confirmar detiene el flujo), así que ninguna plantilla ejecuta escrituras sin el visto
 * bueno del letrado. `confirms` describe en una frase qué confirmará el letrado (HITL).
 */
export interface WorkflowTemplate {
  /** Clave estable para instalar (`POST /ai/workflows/templates/:key/install`). */
  key: string;
  name: string;
  description: string;
  /** Caso de uso (para buscar en la galería). */
  useCase: string;
  /** Categoría para agrupar en la galería. */
  category:
    | 'onboarding'
    | 'portfolio'
    | 'litigation'
    | 'transactional'
    | 'documents'
    | 'corporate'
    | 'compliance'
    | 'crm';
  /** Jurisdicción aplicable: 'es', 'do' o null (ambas). */
  jurisdiction: 'es' | 'do' | null;
  /** Qué confirmará el letrado al ejecutar (resumen HITL). */
  confirms: string;
  steps: WorkflowStep[];
}

/**
 * Catálogo inicial de plantillas. Los tokens `<entre ángulos>` son marcadores que el letrado rellena tras
 * instalar (referencias de expediente, IDs, fechas…). Un dry-run ejecuta las lecturas y se detiene ante la
 * primera escritura, así que el letrado puede probar el flujo antes de rellenar los datos reales.
 */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: 'onboarding-cliente-completo',
    name: 'Onboarding de cliente completo',
    description:
      'Comprueba conflictos de interés, da de alta al cliente, abre su expediente y aplica el checklist de ' +
      'presentación correspondiente.',
    useCase: 'Alta de cliente y apertura de expediente con verificación de conflictos',
    category: 'onboarding',
    jurisdiction: null,
    confirms: 'Alta del cliente, apertura del expediente y aplicación del checklist.',
    steps: [
      { tool: 'check_conflict_of_interest', input: { query: '<nombre del cliente o empresa>' } },
      { tool: 'get_kyc_summary', input: {} },
      {
        tool: 'create_client',
        input: { name: '<nombre legal del cliente>', taxId: '<NIF / RNC>' },
      },
      {
        tool: 'create_matter',
        input: {
          title: '<asunto del expediente>',
          type: 'Consulta',
          clientName: '<nombre legal del cliente>',
        },
      },
      {
        tool: 'apply_presentation_to_matter',
        input: {
          matterReference: '<referencia del expediente>',
          presentationTypeName: '<tipo de presentación>',
        },
      },
    ],
  },
  {
    key: 'conversion-lead-cliente',
    name: 'Conversión de lead a cliente',
    description:
      'Revisa los leads cualificados, comprueba conflictos y convierte el prospecto en cliente creando su ' +
      'expediente asociado.',
    useCase: 'Cerrar un prospecto del embudo y darlo de alta como cliente',
    category: 'crm',
    jurisdiction: null,
    confirms: 'Conversión del lead en cliente y creación del expediente asociado.',
    steps: [
      { tool: 'list_leads', input: { status: 'QUALIFIED' } },
      { tool: 'check_conflict_of_interest', input: { query: '<nombre del prospecto>' } },
      {
        tool: 'convert_lead_to_client',
        input: { leadId: '<id del lead>', taxId: '<NIF / RNC>', createMatter: true },
      },
    ],
  },
  {
    key: 'kyc-pendientes',
    name: 'KYC/AML pendientes de revisión',
    description:
      'Repasa el estado agregado de KYC del despacho, localiza al cliente y actualiza su perfil de ' +
      'diligencia debida.',
    useCase: 'Revisión de diligencia debida (KYC/AML) de un cliente',
    category: 'compliance',
    jurisdiction: null,
    confirms: 'Actualización del estado KYC del cliente (a IN_REVIEW).',
    steps: [
      { tool: 'get_kyc_summary', input: {} },
      { tool: 'find_client', input: { name: '<nombre del cliente>' } },
      { tool: 'get_client_kyc', input: { clientId: '<id del cliente>' } },
      { tool: 'upsert_client_kyc', input: { clientId: '<id del cliente>', status: 'IN_REVIEW' } },
    ],
  },
  {
    key: 'repaso-semanal-cartera',
    name: 'Repaso semanal de cartera',
    description:
      'Informe de solo lectura: visión general del despacho, tareas abiertas, expedientes dormidos y ' +
      'estado de cumplimiento KYC. No modifica nada.',
    useCase: 'Radiografía semanal del estado del despacho (informe)',
    category: 'portfolio',
    jurisdiction: null,
    confirms: 'Ninguna — solo lectura (informe).',
    steps: [
      { tool: 'firm_overview', input: {} },
      { tool: 'list_open_tasks', input: {} },
      { tool: 'list_stale_matters_report', input: { staleDays: 30 } },
      { tool: 'get_kyc_summary', input: {} },
    ],
  },
  {
    key: 'reactivar-expedientes-dormidos',
    name: 'Reactivar expedientes dormidos',
    description:
      'Localiza los expedientes sin actividad reciente y crea una tarea de seguimiento para reactivarlos.',
    useCase: 'Detectar y dar seguimiento a expedientes estancados',
    category: 'portfolio',
    jurisdiction: null,
    confirms: 'Creación de una tarea de seguimiento.',
    steps: [
      { tool: 'list_stale_matters_report', input: { staleDays: 45 } },
      { tool: 'create_task', input: { title: 'Reactivar expediente dormido' } },
    ],
  },
  {
    key: 'preparacion-senalamiento',
    name: 'Preparación de señalamiento',
    description:
      'Reúne el detalle del expediente, su cronología, documentos y plazos abiertos, y crea la tarea de ' +
      'preparación de la vista.',
    useCase: 'Preparar una vista o señalamiento judicial',
    category: 'litigation',
    jurisdiction: null,
    confirms: 'Creación de la tarea de preparación de la vista.',
    steps: [
      { tool: 'get_matter', input: { reference: '<referencia del expediente>' } },
      { tool: 'get_matter_timeline', input: { matterReference: '<referencia del expediente>' } },
      { tool: 'list_documents', input: { matterReference: '<referencia del expediente>' } },
      { tool: 'list_open_tasks', input: { matterReference: '<referencia del expediente>' } },
      {
        tool: 'create_task',
        input: { title: 'Preparar señalamiento', matterReference: '<referencia del expediente>' },
      },
    ],
  },
  {
    key: 'plazo-procesal',
    name: 'Cálculo y alta de plazo procesal',
    description:
      'Previsualiza el vencimiento de un plazo procesal (días hábiles + festivos) y crea el plazo con la ' +
      'fecha calculada.',
    useCase: 'Computar y agendar un plazo procesal',
    category: 'litigation',
    jurisdiction: 'es',
    confirms: 'Creación del plazo procesal con vencimiento calculado.',
    steps: [
      {
        tool: 'preview_task_from_deadline',
        input: { deadlineType: 'contestacion', startDate: '<YYYY-MM-DD>', days: 20 },
      },
      {
        tool: 'create_procedural_task',
        input: { deadlineType: 'CONTESTACION', startDate: '<YYYY-MM-DD>', days: 20 },
      },
    ],
  },
  {
    key: 'apertura-operacion-ma',
    name: 'Apertura de operación M&A',
    description:
      'Revisa el expediente y las partes existentes, da de alta al comprador, fija el hito de firma y abre ' +
      'la sala de datos de due diligence.',
    useCase: 'Montar una operación transaccional (M&A) desde cero',
    category: 'transactional',
    jurisdiction: null,
    confirms: 'Alta de la parte, hito de firma y sala de datos.',
    steps: [
      { tool: 'get_matter', input: { reference: '<referencia del expediente>' } },
      {
        tool: 'get_transaction_parties',
        input: { matterReference: '<referencia del expediente>' },
      },
      {
        tool: 'add_transaction_party',
        input: {
          matterReference: '<referencia del expediente>',
          name: '<comprador>',
          side: 'BUYER',
          role: 'PRINCIPAL',
        },
      },
      {
        tool: 'add_transaction_milestone',
        input: {
          matterReference: '<referencia del expediente>',
          kind: 'SIGNING',
          title: 'Firma de la SPA',
          targetDate: '<YYYY-MM-DD>',
        },
      },
      {
        tool: 'create_data_room',
        input: { matterReference: '<referencia del expediente>', name: 'Due Diligence - Fase 1' },
      },
    ],
  },
  {
    key: 'cierre-operacion',
    name: 'Preparación de cierre (closing)',
    description:
      'Revisa los checklists de cierre y el calendario de hitos, y crea el checklist de cierre a partir de ' +
      'una plantilla integrada.',
    useCase: 'Preparar el cierre de una operación transaccional',
    category: 'transactional',
    jurisdiction: null,
    confirms: 'Creación del checklist de cierre.',
    steps: [
      { tool: 'get_closing_checklists', input: { matterReference: '<referencia del expediente>' } },
      {
        tool: 'get_transaction_milestones',
        input: { matterReference: '<referencia del expediente>' },
      },
      {
        tool: 'create_closing_checklist',
        input: {
          matterReference: '<referencia del expediente>',
          title: 'Cierre de la operación',
          templateKey: 'ma_share_purchase',
        },
      },
    ],
  },
  {
    key: 'data-room-due-diligence',
    name: 'Montaje de data room de due diligence',
    description:
      'Revisa las salas existentes del expediente y monta una nueva sala con su carpeta y grupo de acceso ' +
      'para la contraparte.',
    useCase: 'Preparar un data room para due diligence',
    category: 'transactional',
    jurisdiction: null,
    confirms: 'Creación de la sala, la carpeta y el grupo de acceso.',
    steps: [
      { tool: 'list_data_rooms', input: { matterReference: '<referencia del expediente>' } },
      {
        tool: 'create_data_room',
        input: { matterReference: '<referencia del expediente>', name: 'Due Diligence' },
      },
      {
        tool: 'add_data_room_folder',
        input: { roomId: '<id de la sala de datos>', name: 'Legales' },
      },
      {
        tool: 'add_data_room_group',
        input: { roomId: '<id de la sala de datos>', name: 'Comprador y asesores' },
      },
    ],
  },
  {
    key: 'disclosure-schedules',
    name: 'Preparar disclosure schedules',
    description:
      'Revisa los disclosure schedules existentes de la operación y añade uno nuevo (reps & warranties).',
    useCase: 'Documentar reps & warranties de una operación',
    category: 'transactional',
    jurisdiction: null,
    confirms: 'Creación del disclosure schedule.',
    steps: [
      {
        tool: 'get_disclosure_schedules',
        input: { matterReference: '<referencia del expediente>' },
      },
      {
        tool: 'add_disclosure_schedule',
        input: {
          matterReference: '<referencia del expediente>',
          number: 'A.1',
          title: 'Permits and Licenses',
          body: '<contenido del schedule>',
        },
      },
    ],
  },
  {
    key: 'paquete-documentos-intake',
    name: 'Paquete de documentos de intake',
    description:
      'Revisa las plantillas y paquetes disponibles y ensambla un paquete de documentos en el expediente.',
    useCase: 'Generar de una vez la documentación de intake de un expediente',
    category: 'documents',
    jurisdiction: null,
    confirms: 'Generación del paquete de documentos en el expediente.',
    steps: [
      { tool: 'list_templates', input: {} },
      { tool: 'list_document_packages', input: {} },
      {
        tool: 'generate_document_package',
        input: {
          matterReference: '<referencia del expediente>',
          templateNames: ['<plantilla 1>', '<plantilla 2>'],
        },
      },
    ],
  },
  {
    key: 'hoja-de-encargo',
    name: 'Formalizar hoja de encargo',
    description:
      'Consulta la hoja de encargo actual del expediente y genera/actualiza la hoja de encargo (alcance, ' +
      'honorarios y términos) como PDF pendiente de firma.',
    useCase: 'Formalizar el encargo de un expediente',
    category: 'documents',
    jurisdiction: null,
    confirms: 'Generación de la hoja de encargo (pendiente de firma).',
    steps: [
      { tool: 'get_engagement_letter', input: { matterReference: '<referencia del expediente>' } },
      {
        tool: 'save_engagement_letter',
        input: {
          matterReference: '<referencia del expediente>',
          scope: '<alcance del encargo>',
          fees: '<estructura de honorarios>',
          terms: '<términos y condiciones>',
        },
      },
    ],
  },
  {
    key: 'revision-contrato-playbook',
    name: 'Revisión de contrato con playbook',
    description:
      'Localiza el documento del expediente y ejecuta la revisión del contrato contra el playbook del ' +
      'despacho (genera un informe citable).',
    useCase: 'Revisar un contrato contra las posiciones del despacho',
    category: 'documents',
    jurisdiction: null,
    confirms: 'Ejecución de la revisión del contrato contra el playbook (genera informe).',
    steps: [
      { tool: 'list_documents', input: { matterReference: '<referencia del expediente>' } },
      {
        tool: 'run_playbook_review',
        input: {
          matterReference: '<referencia del expediente>',
          documentName: '<nombre del documento>',
        },
      },
    ],
  },
  {
    key: 'secretaria-societaria-acta',
    name: 'Registrar acta de junta',
    description:
      'Localiza la sociedad, revisa su secretaría corporativa y registra un acta de junta en el libro de ' +
      'actas.',
    useCase: 'Registrar un acta de junta general o de consejo',
    category: 'corporate',
    jurisdiction: null,
    confirms: 'Registro del acta en el libro corporativo.',
    steps: [
      { tool: 'find_client', input: { name: '<nombre de la sociedad>' } },
      { tool: 'get_company_secretary_overview', input: { clientId: '<id de la sociedad>' } },
      {
        tool: 'add_corporate_minute',
        input: {
          clientId: '<id de la sociedad>',
          title: 'Junta General Ordinaria',
          meetingDate: '<YYYY-MM-DD>',
          body: '<orden del día y acuerdos>',
        },
      },
    ],
  },
  {
    key: 'obligaciones-registrales',
    name: 'Alta de obligación registral anual',
    description:
      'Localiza la sociedad, revisa su secretaría corporativa y da de alta una obligación registral ' +
      'recurrente (p. ej. cuentas anuales).',
    useCase: 'Registrar una obligación registral recurrente de una sociedad',
    category: 'corporate',
    jurisdiction: null,
    confirms: 'Alta de la obligación registral anual.',
    steps: [
      { tool: 'find_client', input: { name: '<nombre de la sociedad>' } },
      { tool: 'get_company_secretary_overview', input: { clientId: '<id de la sociedad>' } },
      {
        tool: 'add_registry_obligation',
        input: {
          clientId: '<id de la sociedad>',
          title: 'Cuentas anuales al Registro Mercantil',
          dueDate: '<YYYY-MM-DD>',
          recurrence: 'ANNUAL',
        },
      },
    ],
  },
  {
    key: 'cierre-fiscal-mensual',
    name: 'Cierre fiscal mensual (e-CF / Verifactu)',
    description:
      'Repasa la configuración fiscal del despacho (series y certificado) y la visión general, y crea una ' +
      'tarea recordatorio del cierre fiscal del mes. La emisión se hace en el módulo fiscal; este flujo ' +
      'prepara el recordatorio.',
    useCase: 'Recordatorio y repaso del cierre fiscal mensual',
    category: 'compliance',
    jurisdiction: null,
    confirms: 'Creación de la tarea recordatorio de cierre fiscal mensual.',
    steps: [
      { tool: 'get_firm_settings', input: {} },
      { tool: 'firm_overview', input: {} },
      { tool: 'create_task', input: { title: 'Revisar emisión e-CF / Verifactu del mes' } },
    ],
  },
  {
    key: 'dunning-review',
    name: 'Revisión de cobros (dunning)',
    description:
      'Repasa las vistas guardadas de facturas y la visión general del despacho, y crea una tarea de ' +
      'seguimiento de cobros. El cobro se gestiona en Facturación; este flujo prepara el seguimiento.',
    useCase: 'Seguimiento de facturas vencidas y morosidad',
    category: 'crm',
    jurisdiction: null,
    confirms: 'Creación de la tarea de seguimiento de cobros.',
    steps: [
      { tool: 'list_saved_views', input: { scope: 'invoices' } },
      { tool: 'firm_overview', input: {} },
      {
        tool: 'create_task',
        input: { title: 'Revisar facturas vencidas y contactar a clientes morosos' },
      },
    ],
  },
  {
    key: 'nutricion-pipeline',
    name: 'Nutrición del pipeline de leads',
    description: 'Repasa los leads contactados y actualiza su estado en el embudo de captación.',
    useCase: 'Mover leads por el embudo de captación',
    category: 'crm',
    jurisdiction: null,
    confirms: 'Actualización del estado del lead.',
    steps: [
      { tool: 'list_leads', input: { status: 'CONTACTED' } },
      { tool: 'update_lead', input: { leadId: '<id del lead>', status: 'QUALIFIED' } },
    ],
  },
  {
    key: 'alta-portal-cliente',
    name: 'Alta de acceso al portal del cliente',
    description:
      'Localiza al cliente, consulta su detalle y crea su usuario de portal enviándole la invitación de ' +
      'activación.',
    useCase: 'Dar acceso al portal a un cliente existente',
    category: 'onboarding',
    jurisdiction: null,
    confirms: 'Creación del usuario de portal y envío de la invitación.',
    steps: [
      { tool: 'find_client', input: { name: '<nombre del cliente>' } },
      { tool: 'get_client_detail', input: { clientId: '<id del cliente>' } },
      {
        tool: 'create_client_portal_user',
        input: {
          clientId: '<id del cliente>',
          email: '<correo del portal>',
          password: '<contraseña temporal segura>',
          fullName: '<nombre completo>',
        },
      },
    ],
  },
];
