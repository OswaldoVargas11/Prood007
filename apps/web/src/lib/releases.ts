/**
 * Versionado de la app y notas de cada versión. Al iniciar sesión, si la versión vista por el usuario
 * (localStorage) es distinta de `CURRENT_VERSION`, se muestra el diálogo "Novedades" con los cambios.
 *
 * Mantener `RELEASES` ordenado de MÁS NUEVO a MÁS ANTIGUO, y subir `CURRENT_VERSION` (y los
 * package.json) en cada entrega. Las notas van en español (la app es es-ES/es-DO).
 *
 * CONVENCIÓN para el usuario final: `highlights` = SOLO cambios de EXPERIENCIA DE USUARIO (lo que el
 * usuario nota y le importa). Los cambios técnicos (seguridad, refactors, fixes internos, tests) NO se
 * detallan: se resumen en una sola línea genérica `improvements` ("Mejoras y correcciones…").
 */
export const CURRENT_VERSION = '0.2.0';

export interface Release {
  version: string;
  /** Fecha de publicación (yyyy-mm-dd). */
  date: string;
  /** Cambios de EXPERIENCIA DE USUARIO (visibles y relevantes para el usuario). */
  highlights: string[];
  /** Resumen genérico de cambios TÉCNICOS (seguridad/bugs/mejoras internas). No detallar. */
  improvements?: string;
}

export const RELEASES: Release[] = [
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
