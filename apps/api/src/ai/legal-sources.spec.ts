import { legalSourceLinks } from './legal-sources';

describe('legalSourceLinks', () => {
  it('ES devuelve CENDOJ + BOE con URLs https', () => {
    const links = legalSourceLinks('es', 'despido improcedente');
    const sources = links.map((l) => l.source);
    expect(sources).toEqual(expect.arrayContaining(['CENDOJ (Poder Judicial)', 'BOE']));
    expect(links.every((l) => l.url.startsWith('https://'))).toBe(true);
    expect(links.find((l) => l.source === 'BOE')!.url).toContain('boe.es');
  });

  it('RD devuelve Poder Judicial + DGII', () => {
    const sources = legalSourceLinks('do', 'amparo').map((l) => l.source);
    expect(sources).toEqual(expect.arrayContaining(['Poder Judicial RD', 'DGII']));
  });

  it('codifica los términos de búsqueda en la URL', () => {
    const url = legalSourceLinks('es', 'a b').find((l) => l.source === 'BOE')!.url;
    expect(url).toContain(encodeURIComponent('site:boe.es a b'));
  });
});
