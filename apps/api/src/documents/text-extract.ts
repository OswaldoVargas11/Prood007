import JSZip from 'jszip';

/**
 * Extracción de texto plano de una versión de documento para comparar redlines. Soporta los formatos
 * que de verdad circulan en una negociación transaccional: .docx (el caso típico — la otra parte
 * devuelve el Word marcado), texto plano y, de forma básica, .doc binario degradado a "no extraíble".
 * No persiste nada: opera sobre el buffer ya descargado del almacenamiento.
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface ExtractResult {
  /** true si se pudo extraer texto legible; false si el formato no lo permite. */
  extractable: boolean;
  text: string;
}

/** Decodifica entidades XML básicas presentes en document.xml. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Convierte el XML de un .docx en texto: respeta saltos de párrafo (`</w:p>`), saltos de línea
 * (`<w:br/>`) y tabuladores (`<w:tab/>`), y descarta el resto de etiquetas.
 */
function docxXmlToText(xml: string): string {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeEntities(stripped)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tope del tamaño DESCOMPRIMIDO de document.xml (anti zip-bomb). */
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB

async function extractDocx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const main = zip.file('word/document.xml');
  if (!main) return '';
  // L-1 (CWE-409): el límite de subida (25 MB) acota el ZIP COMPRIMIDO, no lo inflado. Un `.docx` cuyo
  // document.xml sea un zip-bomb descomprimiría a cientos de MB/GB en una sola string en memoria. JSZip
  // expone el tamaño descomprimido del directorio central tras `loadAsync`; lo comprobamos ANTES de inflar.
  const uncompressed = (main as unknown as { _data?: { uncompressedSize?: number } })._data
    ?.uncompressedSize;
  if (typeof uncompressed === 'number' && uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES) {
    throw new Error('document.xml descomprimido excede el límite permitido (posible zip-bomb)');
  }
  const xml = await main.async('string');
  return docxXmlToText(xml);
}

/** Extrae texto según el tipo MIME. Para formatos no soportados devuelve extractable=false. */
export async function extractText(mimeType: string, buffer: Buffer): Promise<ExtractResult> {
  if (mimeType === DOCX_MIME) {
    try {
      return { extractable: true, text: await extractDocx(buffer) };
    } catch {
      return { extractable: false, text: '' };
    }
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return { extractable: true, text: buffer.toString('utf8').replace(/\r\n?/g, '\n').trim() };
  }
  // PDF (.pdf), .doc binario, imágenes, etc.: no se extrae texto en este slice.
  return { extractable: false, text: '' };
}
