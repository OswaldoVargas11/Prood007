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
export const CURRENT_VERSION = '0.3.0';

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
