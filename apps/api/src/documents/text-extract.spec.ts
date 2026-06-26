import JSZip from 'jszip';
import { extractText } from './text-extract';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function makeDocx(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('extractText (.docx)', () => {
  it('extrae texto de un .docx normal (regresión: la guarda anti zip-bomb no rompe el caso normal)', async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Hola mundo</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Segunda línea</w:t></w:r></w:p></w:body></w:document>';
    const buf = await makeDocx(xml);
    const res = await extractText(DOCX_MIME, buf);
    expect(res.extractable).toBe(true);
    expect(res.text).toContain('Hola mundo');
    expect(res.text).toContain('Segunda línea');
  });

  it('devuelve no-extraíble para un buffer que no es un zip válido (sin lanzar)', async () => {
    const res = await extractText(DOCX_MIME, Buffer.from('no soy un zip'));
    expect(res.extractable).toBe(false);
    expect(res.text).toBe('');
  });

  it('extrae texto plano de text/*', async () => {
    const res = await extractText('text/plain', Buffer.from('línea 1\r\nlínea 2'));
    expect(res.extractable).toBe(true);
    expect(res.text).toBe('línea 1\nlínea 2');
  });
});
