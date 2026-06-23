import { BadRequestException } from '@nestjs/common';
import { apiError } from './api-messages';

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

/**
 * Detecta por MAGIC BYTES si un buffer es realmente una imagen rasterizada o un PDF (no se fía del
 * `mimetype` declarado por el cliente, que es falsificable). Devuelve el tipo o `null`. Cubre PNG/JPEG/
 * GIF/WEBP/PDF. Evita subir, p. ej., HTML/SVG etiquetado como `image/png`.
 */
/**
 * Tipos/extensiones con CONTENIDO ACTIVO que el navegador puede ejecutar si se llegara a servir inline
 * en el origen de la API (XSS almacenado). `safeContentDisposition` ya fuerza `attachment` para estos,
 * pero la defensa correcta es además NO aceptarlos en la subida. Se bloquean por mimetype declarado,
 * por extensión y por sniff de contenido (un HTML/SVG disfrazado de image/png también cae).
 */
const BLOCKED_UPLOAD_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-shockwave-flash',
  'application/xml',
  'text/xml',
]);
const BLOCKED_UPLOAD_EXT = new Set([
  'html',
  'htm',
  'xhtml',
  'shtml',
  'svg',
  'js',
  'mjs',
  'xml',
  'swf',
  'xsl',
]);

/** ¿El inicio del buffer parece markup activo (HTML/SVG/XML)? No se fía del mimetype declarado. */
function sniffsAsActiveMarkup(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  return (
    head.startsWith('<!doctype html') ||
    head.startsWith('<html') ||
    head.startsWith('<svg') ||
    head.startsWith('<?xml') ||
    head.includes('<script')
  );
}

/**
 * Verifica que un fichero SUBIDO no sea contenido activo (HTML/SVG/JS/…) que habilite XSS almacenado.
 * Lanza `BadRequestException` (`documents.uploadRejected`) si lo es. Pensado como red transversal en el
 * pipeline de subida (documentos, data-room, portal, logo del despacho), complementando el `attachment`
 * de la descarga. NO restringe a una allowlist cerrada (los despachos suben pdf/docx/xlsx/imágenes/txt):
 * solo veta los tipos ejecutables.
 */
export function assertUploadSafe(
  mime: string | null | undefined,
  filename: string | null | undefined,
  buffer: Buffer,
): void {
  const m = (mime || '').toLowerCase().split(';')[0]!.trim();
  const ext = (filename || '').toLowerCase().split('.').pop() ?? '';
  if (BLOCKED_UPLOAD_MIME.has(m) || BLOCKED_UPLOAD_EXT.has(ext) || sniffsAsActiveMarkup(buffer)) {
    throw new BadRequestException(apiError('documents.uploadRejected'));
  }
}

export function sniffSafeUploadType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  // WEBP: "RIFF"...."WEBP"
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
