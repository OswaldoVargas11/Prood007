/**
 * Versionado de la app y notas de cada versión. Al iniciar sesión, si la versión vista por el usuario
 * (localStorage) es distinta de `CURRENT_VERSION`, se muestra el diálogo "Novedades" con los cambios.
 *
 * Mantener `RELEASES` ordenado de MÁS NUEVO a MÁS ANTIGUO, y subir `CURRENT_VERSION` (y los
 * package.json) en cada entrega. Las notas van en español (la app es es-ES/es-DO).
 *
 * CONVENCIÓN para el usuario final: `highlights` = SOLO cambios de EXPERIENCIA DE USUARIO (lo que el
 * usuario nota y le importa). `fixes` = correcciones de errores contadas EN SUPERFICIE (qué se arregló,
 * sin tecnicismos). Los cambios puramente técnicos (refactors, tests) se resumen en `improvements`.
 */
export const CURRENT_VERSION = '1.0.0';

export interface Release {
  version: string;
  /** Fecha de publicación (yyyy-mm-dd). */
  date: string;
  /** Cambios de EXPERIENCIA DE USUARIO (visibles y relevantes para el usuario). */
  highlights: string[];
  /** Correcciones de errores, en superficie (qué se arregló, sin detalle técnico). */
  fixes?: string[];
  /** Resumen genérico de cambios TÉCNICOS (seguridad/mejoras internas). No detallar. */
  improvements?: string;
}

export const RELEASES: Release[] = [
  {
    version: '1.0.0',
    date: '2026-06-27',
    highlights: [
      'Zora, tu asistente con IA: conversa, entiende el estado de tu despacho y te ayuda de verdad — redacta documentos y crea clientes, expedientes y tareas, siempre pidiéndote confirmación antes de escribir. Responde en vivo (efecto "escribiendo"), puedes pararla en cualquier momento y recuerda vuestras conversaciones.',
      'Resumen del día con IA en la pantalla de inicio: lo importante de hoy de un vistazo.',
      'Módulo transaccional / M&A: sala de due diligence (data room) con marca de agua, permisos y preguntas-respuestas; cierre con generación del "closing binder", escrow, grupo de trabajo, calendario de la operación, disclosure schedules y registros por jurisdicción.',
      'Secretaría de sociedades: actas, socios, transferencias de participaciones y obligaciones ante el Registro.',
      'Captación de clientes: embudo de prospectos con conversión a cliente y hoja de encargo (alcance, honorarios y términos).',
      'Chat interno del despacho: mensajería directa y canal general con presencia, reacciones, menciones y adjuntar documentos.',
      'Expediente más potente: equipo multi-letrado, carpetas anidadas, tablero kanban para cambiar de estado arrastrando, pestañas agrupadas por afinidad, línea de tiempo y checklists por tipo de gestión (exportables a PDF).',
      'Productividad: vistas guardadas (tus filtros), quick-add en la barra superior, avisos de expedientes sin actividad y de tiempo sin facturar, y rentabilidad por expediente y por letrado con gráficos.',
      'Documentos: comparación y redline de versiones, ensamblado de varios documentos por paquetes de plantillas, biblioteca de cláusulas, plantillas de correo y búsqueda semántica por el contenido de los documentos.',
      'Correo y Office: archiva correos al expediente con copia oculta (cuerpo y adjuntos), add-ins de Word y Outlook, auto-agenda de citas estilo Calendly y bandeja LexNET con cómputo de plazos.',
      'Firma electrónica en lote e importación de archivos desde Google Drive, OneDrive y SharePoint.',
      'Fiscal: e-CF (RD) con numeración por rangos autorizados y estado en cada factura, y Verifactu (ES) con certificado de firma por despacho — gestionados desde Ajustes.',
      'Panel de inicio personalizable, app instalable (PWA) y dictado por voz.',
    ],
    fixes: [
      'Alta de clientes sin duplicados: no se repite un cliente por el mismo NIF/RNC.',
      'Suscripción más fiable: el cobro se registra una sola vez y tus funciones se activan según el plan contratado.',
      'Quitados elementos duplicados en la pantalla de inicio (resumen del día y un botón de IA) y arreglado el archivado de correos.',
    ],
    improvements:
      'Gran refuerzo de seguridad (auditorías y pentest de caja negra y white-box de junio 2026), observabilidad, tiempo real multi-instancia, mejor posicionamiento en buscadores y mejoras de rendimiento y accesibilidad.',
  },
  {
    version: '0.3.0',
    date: '2026-06-20',
    highlights: [
      'Agenda y correo conectados: sincroniza tus plazos con Google Calendar y Outlook, y envía o archiva correos directamente en cada expediente.',
      'Importa tu cartera de clientes desde un archivo, sin darlos de alta uno a uno.',
      'Captación de clientes: embudo de prospectos y un formulario público para captar desde tu web.',
      'Rentabilidad por expediente: horas, coste, margen y % de cobro; con tarifas por letrado y presupuesto por expediente.',
      'Más seguridad para tu cuenta: verificación en dos pasos (2FA) e inicio de sesión con Google o Microsoft.',
      'Plazas flexibles: añade o quita usuarios cuando quieras; al añadir, solo se cobra la parte proporcional del periodo.',
      'Correos con nuevo diseño y aviso de bienvenida al crear una cuenta; confirmación del correo al registrarte.',
    ],
    fixes: [
      'El restablecimiento de contraseña vuelve a funcionar y los correos (recuperación, invitaciones…) ahora llegan correctamente.',
      'Arreglada la pantalla de inicio de sesión y un caso en el que el enlace de restablecer dejaba la cuenta atascada.',
      'Los importes en distintas monedas y las facturas según jurisdicción se muestran correctamente.',
    ],
    improvements: 'Mejoras de rendimiento, accesibilidad y actualizaciones de seguridad.',
  },
  {
    version: '0.2.0',
    date: '2026-06-19',
    highlights: [
      'Planes en formato de cartas, con pago anual (2 meses gratis) y Plan Fundador.',
      'Inicia sesión aunque tu cuenta exista en varios despachos (elige el despacho).',
      'Nombre e ID del despacho visibles en la cabecera (para dar a soporte).',
      'Factura en varias monedas (EUR/USD/DOP) y elige el formato España o Rep. Dominicana.',
      'Provisión de fondos y facturación recurrente también en la moneda que elijas.',
    ],
    improvements: 'Mejoras de rendimiento, correcciones de errores y actualizaciones de seguridad.',
  },
];
