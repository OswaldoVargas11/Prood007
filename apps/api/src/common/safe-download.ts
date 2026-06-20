/**
 * Cabecera `Content-Disposition` segura para servir ficheros SUBIDOS por el usuario.
 *
 * Riesgo: servir contenido subido (p. ej. un HTML/SVG) con `inline` en el origen de la API permitiría
 * XSS almacenado. Defensa: solo se sirve `inline` un conjunto acotado de tipos seguros (imágenes
 * rasterizadas + PDF); cualquier otro tipo se fuerza a `attachment` (descarga, no se renderiza).
 *
 * Nota: image/svg+xml NO está en la lista (un SVG puede ejecutar script).
 */
const INLINE_SAFE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/** Sanea el nombre de archivo para la cabecera (sin comillas ni saltos que permitan inyección). */
function sanitizeFilename(name: string | null | undefined): string {
  return (name || 'archivo').replace(/["\r\n\\]/g, '').slice(0, 180) || 'archivo';
}

/** Devuelve la cabecera Content-Disposition: `inline` solo para tipos seguros; `attachment` el resto. */
export function safeContentDisposition(mime: string | null | undefined, filename?: string): string {
  const inline = INLINE_SAFE_MIME.has((mime || '').toLowerCase());
  return `${inline ? 'inline' : 'attachment'}; filename="${sanitizeFilename(filename)}"`;
}

/** ¿Es un tipo seguro para previsualizar/aceptar (imagen rasterizada o PDF)? Útil para justificantes. */
export function isInlineSafeMime(mime: string | null | undefined): boolean {
  return INLINE_SAFE_MIME.has((mime || '').toLowerCase());
}
