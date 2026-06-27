/**
 * Guía de funciones de Lawzora: FUENTE ÚNICA para (a) la página de ayuda/documentación de la web y
 * (b) la herramienta `how_to` del agente de IA (para GUIAR al usuario por los menús/pasos, no solo
 * ejecutar). Las etiquetas de menú coinciden con la navegación real (`apps/web/src/lib/nav.ts`).
 */
export interface FeatureGuideEntry {
  /** Identificador estable. */
  id: string;
  /** Nombre de la función (cómo la llamaría el usuario). */
  title: string;
  /** Grupo del menú lateral (etiqueta real). */
  group: string;
  /** Etiqueta del ítem de menú donde vive (o null si es una acción dentro de una sección). */
  menu: string;
  /** Ruta de la app. */
  route: string;
  /** Para qué sirve, en una frase. */
  what: string;
  /** Pasos para hacerlo desde la interfaz. */
  steps: string[];
  /** Palabras clave para la búsqueda (sinónimos). */
  keywords: string[];
  /** Solo administradores del despacho. */
  adminOnly?: boolean;
}

export const FEATURE_GUIDE: FeatureGuideEntry[] = [
  {
    id: 'open-matter',
    title: 'Abrir un expediente',
    group: 'Espacio de trabajo',
    menu: 'Expedientes',
    route: '/matters',
    what: 'Crear un expediente/asunto nuevo vinculado a un cliente.',
    steps: [
      'En el menú lateral, ve a «Expedientes».',
      'Pulsa «Nuevo expediente» (arriba a la derecha).',
      'Elige el cliente (o créalo antes en «Clientes»), pon título, tipo y parte contraria si la hay.',
      'Guarda: se genera la referencia (p. ej. EXP-2026-0042).',
    ],
    keywords: ['expediente', 'caso', 'asunto', 'matter', 'abrir', 'crear', 'nuevo'],
  },
  {
    id: 'create-client',
    title: 'Dar de alta un cliente',
    group: 'Espacio de trabajo',
    menu: 'Clientes',
    route: '/clients',
    what: 'Registrar un cliente nuevo (valida el identificador fiscal según la jurisdicción).',
    steps: [
      'Ve a «Clientes» en el menú lateral.',
      'Pulsa «Nuevo cliente».',
      'Rellena nombre, NIF/RNC y datos de contacto.',
      'Guarda. Después podrás abrirle expedientes.',
    ],
    keywords: ['cliente', 'alta', 'crear', 'nif', 'rnc', 'contacto'],
  },
  {
    id: 'leads',
    title: 'Gestionar captación (leads)',
    group: 'Espacio de trabajo',
    menu: 'Captación',
    route: '/leads',
    what: 'Embudo de prospectos: del primer contacto a cliente.',
    steps: [
      'Ve a «Captación».',
      'Crea o arrastra leads entre estados (Nuevo, Contactado, Cualificado…).',
      'Cuando uno se cierre, conviértelo en cliente (y opcionalmente abre expediente).',
    ],
    keywords: ['lead', 'captación', 'prospecto', 'embudo', 'pipeline', 'ventas'],
  },
  {
    id: 'tasks',
    title: 'Crear tareas y plazos',
    group: 'Espacio de trabajo',
    menu: 'Tareas',
    route: '/tasks',
    what: 'Tareas y plazos (procesales o internos), opcionalmente ligados a un expediente.',
    steps: [
      'Ve a «Tareas».',
      'Pulsa «Nueva tarea», pon título y vencimiento.',
      'Asóciala a un expediente y a un responsable si procede.',
    ],
    keywords: ['tarea', 'plazo', 'vencimiento', 'recordatorio', 'agenda'],
  },
  {
    id: 'calendar',
    title: 'Ver la agenda',
    group: 'Espacio de trabajo',
    menu: 'Agenda',
    route: '/calendar',
    what: 'Calendario con plazos y eventos del despacho.',
    steps: ['Ve a «Agenda» para ver vencimientos y eventos en vista de calendario.'],
    keywords: ['agenda', 'calendario', 'eventos', 'vencimientos'],
  },
  {
    id: 'time',
    title: 'Registrar tiempo',
    group: 'Espacio de trabajo',
    menu: 'Tiempo',
    route: '/time',
    what: 'Imputar horas a expedientes para facturación/rentabilidad.',
    steps: ['Ve a «Tiempo».', 'Registra una entrada: expediente, duración y descripción.'],
    keywords: ['tiempo', 'horas', 'imputación', 'timesheet', 'rentabilidad'],
  },
  {
    id: 'documents',
    title: 'Subir y gestionar documentos',
    group: 'Documentación',
    menu: 'Documentos',
    route: '/documents',
    what: 'Documentos del despacho/expedientes, con versiones y carpetas.',
    steps: [
      'Ve a «Documentos» (o entra al expediente y su pestaña de documentos).',
      'Sube el archivo o impórtalo desde la nube; organízalo en carpetas.',
    ],
    keywords: ['documento', 'subir', 'archivo', 'carpeta', 'versión', 'pdf'],
  },
  {
    id: 'templates',
    title: 'Plantillas de documento',
    group: 'Documentación',
    menu: 'Plantillas',
    route: '/templates',
    what: 'Biblioteca de plantillas reutilizables con campos {{como_este}}.',
    steps: [
      'Ve a «Plantillas».',
      'Crea o edita una plantilla; úsala luego para redactar escritos.',
    ],
    keywords: ['plantilla', 'modelo', 'escrito', 'template'],
  },
  {
    id: 'presentations',
    title: 'Presentaciones y checklists',
    group: 'Documentación',
    menu: 'Presentaciones',
    route: '/presentations',
    what: 'Checklists de requisitos por tipo de trámite, con seguimiento de completitud.',
    steps: [
      'Ve a «Presentaciones».',
      'Aplica un tipo de checklist a un expediente y marca los ítems aportados.',
    ],
    keywords: ['presentación', 'checklist', 'requisitos', 'trámite'],
  },
  {
    id: 'messages',
    title: 'Mensajería interna',
    group: 'Comunicación',
    menu: 'Mensajes',
    route: '/messages',
    what: 'Chat interno del despacho (y con el equipo).',
    steps: ['Ve a «Mensajes» o usa el dock de chat abajo a la derecha.'],
    keywords: ['mensaje', 'chat', 'comunicación', 'equipo'],
  },
  {
    id: 'billing',
    title: 'Facturación',
    group: 'Finanzas',
    menu: 'Facturación',
    route: '/billing',
    what: 'Configurar y preparar la facturación del despacho.',
    steps: ['Ve a «Facturación» para gestionar el cobro y la configuración fiscal.'],
    keywords: ['facturación', 'cobro', 'fiscal'],
  },
  {
    id: 'invoices',
    title: 'Facturas',
    group: 'Finanzas',
    menu: 'Facturas',
    route: '/invoices',
    what: 'Listado y emisión de facturas (e-CF en RD, Verifactu en ES).',
    steps: ['Ve a «Facturas».', 'Crea una factura desde un expediente/cliente y emítela.'],
    keywords: ['factura', 'invoice', 'e-cf', 'verifactu', 'emitir'],
  },
  {
    id: 'scheduling',
    title: 'Citas con clientes',
    group: 'Tramitación',
    menu: 'Citas',
    route: '/scheduling',
    what: 'Solicitudes y confirmación de citas/reuniones.',
    steps: ['Ve a «Citas».', 'Revisa solicitudes y confírmalas o reprográmalas.'],
    keywords: ['cita', 'reunión', 'agendar', 'scheduling'],
  },
  {
    id: 'aml',
    title: 'KYC / AML (prevención de blanqueo)',
    group: 'Tramitación',
    menu: 'AML',
    route: '/aml',
    what: 'Diligencia debida de clientes: estado, riesgo, PEP, verificaciones.',
    steps: [
      'Ve a «AML».',
      'Abre el perfil del cliente y registra su diligencia y nivel de riesgo.',
    ],
    keywords: ['aml', 'kyc', 'blanqueo', 'pep', 'diligencia', 'riesgo'],
  },
  {
    id: 'reports',
    title: 'Informes',
    group: 'Despacho',
    menu: 'Informes',
    route: '/reports',
    what: 'Cuadros de mando y métricas del despacho.',
    steps: ['Ve a «Informes» (solo administradores).'],
    keywords: ['informe', 'reporte', 'métricas', 'dashboard', 'estadísticas'],
    adminOnly: true,
  },
  {
    id: 'import',
    title: 'Importar datos / de la nube',
    group: 'Despacho',
    menu: 'Importar',
    route: '/import',
    what: 'Traer documentos desde Google Drive / OneDrive / SharePoint a un expediente.',
    steps: [
      'Ve a «Importar» (solo administradores).',
      'Conecta el proveedor y elige los archivos.',
    ],
    keywords: ['importar', 'drive', 'onedrive', 'sharepoint', 'nube'],
    adminOnly: true,
  },
  {
    id: 'settings',
    title: 'Ajustes del despacho',
    group: 'Despacho',
    menu: 'Ajustes',
    route: '/settings',
    what: 'Configuración: datos del despacho, jurisdicción, festivos, certificados, puestos.',
    steps: ['Ve a «Ajustes» (solo administradores).'],
    keywords: ['ajustes', 'configuración', 'despacho', 'festivos', 'certificado', 'usuarios'],
    adminOnly: true,
  },
  {
    id: 'ai-assistant',
    title: 'Asistente de IA',
    group: 'Espacio de trabajo',
    menu: 'Asistente (botón ✨ abajo a la derecha)',
    route: '/dashboard',
    what: 'Agente que consulta datos reales y puede crear cosas (con tu confirmación).',
    steps: [
      'Pulsa el botón ✨ abajo a la derecha en cualquier pantalla.',
      'Pídele en lenguaje natural (p. ej. «abre un expediente para…», «¿qué plazos vencen?»).',
      'Para acciones que cambian datos, confirma cuando te lo pida.',
    ],
    keywords: ['ia', 'asistente', 'agente', 'chatbot', 'ai'],
  },
];

/** Búsqueda simple de funciones por texto (título/qué/keywords). Para la tool `how_to` del agente. */
export function searchFeatureGuide(query: string, limit = 5): FeatureGuideEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return FEATURE_GUIDE.slice(0, limit);
  const terms = q.split(/\s+/);
  const scored = FEATURE_GUIDE.map((e) => {
    const hay = (e.title + ' ' + e.what + ' ' + e.keywords.join(' ') + ' ' + e.menu).toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { e, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored).slice(0, limit).map((x) => x.e);
}
