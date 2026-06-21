// Normaliza SOLO ruido incidental antes de comparar contra el golden.
//
// Principio: como el fixture congela reloj, serie/secuencia y semilla de
// encadenamiento (previousRecordHash), casi todo es determinista —incluida la
// huella—. Por eso la lista de campos a neutralizar es MÍNIMA: solo ids de fila
// autogenerados u otros artefactos que no forman parte de la semántica fiscal.
//
// En LegalFlow `buildInvoiceRecord` (Spain/Dominican provider) es una función
// PURA: no toca BD, reloj de sistema ni random, así que hoy esta lista está
// vacía de hecho. Se conserva como red de seguridad: si el record llegara a
// arrastrar un id de fila u otra URL efímera, se neutraliza aquí.
//
// ⚠️ NO añadas aquí: invoiceNumber, eNCF, taxableBase, taxAmount, tipoIva,
// withholdingAmount, recordHash, huella, encadenamiento, qrUrl, ecfXml,
// importeTotal, total. Esos campos SON la conformidad: si los normalizas, el
// harness deja de protegerte.

const VOLATILE_KEYS = new Set<string>([
  'rowId', // id autoincrement de BD, si el record lo arrastrase
  'dbId',
  'pdfUrl', // URL firmada/efímera del PDF
  '_internalRef', // referencias internas no fiscales
]);

export function normalizeFiscalRecord(record: unknown): unknown {
  return JSON.parse(
    JSON.stringify(record, (key, value) => (VOLATILE_KEYS.has(key) ? '<normalized>' : value)),
  );
}
