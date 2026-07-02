import JSZip from 'jszip';

/**
 * Export CSV/XLSX de una revisión tabular. Sin dependencias nuevas: el XLSX se ensambla como el paquete
 * OOXML mínimo (una hoja, celdas como inline strings) con JSZip, que ya usa el closing binder. Funciones
 * PURAS y deterministas: la forma de la tabla la decide el servicio; aquí solo se serializa.
 */

export interface TabularExportTable {
  title: string;
  /** Cabeceras: primera columna = documento, después las columnas de la revisión. */
  headers: string[];
  /** Filas ya resueltas a texto plano (misma longitud que `headers`). */
  rows: string[][];
}

/** Escapa un campo CSV (RFC 4180): comillas dobladas y campo entrecomillado si hace falta. */
function csvField(value: string): string {
  if (/[",\n\r;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** CSV con BOM UTF-8 (para que Excel detecte la codificación) y separador coma. */
export function toCsv(table: TabularExportTable): string {
  const lines = [table.headers, ...table.rows].map((row) => row.map(csvField).join(','));
  return '\ufeff' + `${lines.join('\r\n')}\r\n`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Referencia de columna estilo hoja de cálculo: 0 → A, 25 → Z, 26 → AA… */
export function columnRef(index: number): string {
  let ref = '';
  let n = index;
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ref;
}

function sheetXml(table: TabularExportTable): string {
  const rows = [table.headers, ...table.rows]
    .map((row, r) => {
      const cells = row
        .map(
          (value, c) =>
            `<c r="${columnRef(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

/** Genera el .xlsx (paquete OOXML mínimo: workbook + una hoja con inline strings). */
export async function buildXlsx(table: TabularExportTable): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${xmlEscape(table.title.slice(0, 31) || 'Revisión')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `</Relationships>`,
  );
  zip.file('xl/worksheets/sheet1.xml', sheetXml(table));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
