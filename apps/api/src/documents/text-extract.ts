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
 *
 * Escáner LINEAL, no basado en `<[^>]+>` (LAW-72, CodeQL js/bad-tag-filter +
 * js/incomplete-multi-char-sanitization): un filtro de etiquetas por regex se puede evadir —un `>` dentro
 * de un valor de atributo entrecomillado o un comentario `<!-- … > … -->` corta la etiqueta antes de
 * tiempo y deja restos en una sola pasada—. Este recorrido avanza SIEMPRE hacia delante: respeta las
 * comillas de atributo y los comentarios, así que no puede quedar un fragmento de etiqueta ni reformarse
 * una nueva. Sólo opera sobre document.xml ya acotado por la guarda anti zip-bomb.
 */
function docxXmlToText(xml: string): string {
  let out = '';
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      out += xml.slice(i);
      break;
    }
    out += xml.slice(i, lt);
    // Comentario XML: se cierra sólo con `-->` (un `>` intermedio no lo termina).
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    // Busca el `>` de cierre real, ignorando los que van dentro de comillas de atributo.
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
    }
    // Mapea las etiquetas con semántica de espacio; el resto se descarta. Los tests `^…` corren sobre un
    // ÚNICO token de etiqueta (longitud acotada, sin cuantificadores solapados) → no son filtros de tag.
    const tag = xml.slice(lt, j + 1);
    if (/^<w:tab[\s/>]/.test(tag)) out += '\t';
    else if (/^<w:br[\s/>]/.test(tag)) out += '\n';
    else if (tag === '</w:p>') out += '\n';
    i = j + 1;
  }
  return decodeEntities(out)
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
