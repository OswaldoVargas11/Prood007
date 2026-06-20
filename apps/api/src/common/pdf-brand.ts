/**
 * Estilo de marca COMPARTIDO para todos los PDF que genera y entrega el sistema (facturas, documentos
 * desde plantilla…). Membrete con el nombre del despacho + filete de marca, tipografía cuidada y pie en
 * todas las páginas. Mantiene una estética consistente y profesional en todo lo que recibe el usuario.
 */

export const PDF_BRAND = '#534AB7';
export const PDF_INK = '#1f2430';
export const PDF_MUTED = '#6b7280';
export const PDF_HAIRLINE = '#e5e7eb';
export const PDF_MARGIN = 56;

/**
 * Dibuja el membrete: nombre del despacho (en color de marca) + identificación fiscal a la izquierda y
 * una etiqueta del documento a la derecha, rematado con un filete de marca. Devuelve la `y` donde debe
 * empezar el contenido.
 */
export function drawBrandHeader(
  doc: PDFKit.PDFDocument,
  opts: { firmName: string; firmTaxId?: string | null; label: string; sublabel?: string },
): number {
  const left = PDF_MARGIN;
  const right = doc.page.width - PDF_MARGIN;

  doc
    .fillColor(PDF_BRAND)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(opts.firmName, left, PDF_MARGIN, { width: right - left - 170 });
  if (opts.firmTaxId) {
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica')
      .fontSize(8.5)
      .text(opts.firmTaxId, left, PDF_MARGIN + 19, { width: right - left - 170 });
  }

  doc
    .fillColor(PDF_INK)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(opts.label.toUpperCase(), left, PDF_MARGIN + 1, { width: right - left, align: 'right' });
  if (opts.sublabel) {
    doc
      .fillColor(PDF_MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(opts.sublabel, left, PDF_MARGIN + 23, { width: right - left, align: 'right' });
  }

  const y = PDF_MARGIN + 48;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(PDF_BRAND).stroke();
  doc.lineWidth(1).fillColor(PDF_INK);
  return y + 20;
}

/**
 * Dibuja el pie (filete fino + nota a la izquierda y nº de página a la derecha) en TODAS las páginas.
 * Requiere que el documento se haya creado con `bufferPages: true`. Llamar justo antes de `doc.end()`.
 */
export function drawBrandFooter(doc: PDFKit.PDFDocument, opts: { note: string }): void {
  const left = PDF_MARGIN;
  const right = doc.page.width - PDF_MARGIN;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - PDF_MARGIN + 10;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(PDF_HAIRLINE).stroke();
    doc.fillColor(PDF_MUTED).font('Helvetica').fontSize(7.5);
    doc.text(opts.note, left, y + 6, { width: (right - left) * 0.75, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, left, y + 6, { width: right - left, align: 'right' });
    doc.fillColor(PDF_INK);
  }
}
