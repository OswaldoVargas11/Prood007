import { safeContentDisposition } from './safe-download';

/** Node rechaza valores de cabecera con caracteres fuera de `\t\x20-\x7e\x80-\xff`. */
function isValidHeaderValue(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\t\x20-\x7e\x80-\xff]/.test(value);
}

describe('safeContentDisposition', () => {
  it('fuerza attachment para tipos no seguros e inline para los seguros', () => {
    expect(safeContentDisposition('application/pdf', 'a.pdf')).toContain('inline;');
    expect(safeContentDisposition('image/svg+xml', 'a.svg')).toContain('attachment;');
    expect(safeContentDisposition('application/octet-stream', 'a.bin')).toContain('attachment;');
  });

  it('produce una cabecera válida para nombres con acentos', () => {
    const header = safeContentDisposition('application/pdf', 'Demandá Penal — Año 2026.pdf');
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('filename="');
  });

  it('produce una cabecera válida para nombres con emoji / Unicode > U+00FF (regresión del bug de descarga)', () => {
    const header = safeContentDisposition(null, 'Contrato 📄 firmado 中文.docx');
    expect(isValidHeaderValue(header)).toBe(true);
  });

  it('mantiene el saneado anti-inyección (sin comillas ni saltos)', () => {
    const header = safeContentDisposition(null, 'evil"\r\nSet-Cookie: x.pdf');
    expect(isValidHeaderValue(header)).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
  });

  it('usa un nombre por defecto cuando no hay filename', () => {
    const header = safeContentDisposition('application/pdf');
    expect(header).toContain('filename="archivo"');
  });
});
