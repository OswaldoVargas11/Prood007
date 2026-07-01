import { chunkText, cosine, rankHits, type EmbeddingRow } from './ai-search.service';

/**
 * Lógica PURA de la búsqueda semántica sobre contenido de documentos (LAW-76): chunking del texto
 * extraído y ranking por similitud coseno. Determinista y sin proveedor de embeddings ni BD — así el
 * comportamiento queda cubierto aunque `VOYAGE_API_KEY` no esté en el entorno (la llamada real al
 * proveedor está gateada aparte).
 */
describe('AiSearch — chunkText', () => {
  it('devuelve un único fragmento cuando el texto cabe en maxLen', () => {
    const chunks = chunkText('Contrato de compraventa entre las partes.', 800, 30);
    expect(chunks).toEqual(['Contrato de compraventa entre las partes.']);
  });

  it('normaliza espacios en blanco (colapsa saltos y tabs)', () => {
    const chunks = chunkText('  hola\n\n  mundo\t\tlegal  ', 800, 30);
    expect(chunks).toEqual(['hola mundo legal']);
  });

  it('trocea el texto largo en varios fragmentos acotados por maxLen', () => {
    const word = 'palabra ';
    const text = word.repeat(400); // ~3200 chars
    const chunks = chunkText(text, 200, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it('no parte palabras: corta en límite de espacio', () => {
    const text = 'alfa bravo charlie delta echo foxtrot golf hotel india juliet';
    const chunks = chunkText(text, 20, 30);
    // Cada fragmento va recortado (sin espacios sobrantes en los extremos).
    for (const c of chunks) expect(c.trim()).toBe(c);
    // Reunir los fragmentos (con espacios) reconstruye todas las palabras, sin trocear ninguna.
    const rejoinedWords = chunks.join(' ').split(/\s+/).filter(Boolean);
    expect(rejoinedWords).toEqual(text.split(' '));
  });

  it('respeta el tope maxChunks aunque el texto siga', () => {
    const text = 'x '.repeat(10_000);
    const chunks = chunkText(text, 50, 5);
    expect(chunks.length).toBe(5);
  });

  it('devuelve [] para texto vacío o solo espacios', () => {
    expect(chunkText('', 800, 30)).toEqual([]);
    expect(chunkText('   \n\t  ', 800, 30)).toEqual([]);
  });
});

describe('AiSearch — cosine', () => {
  it('vale 1 para vectores idénticos', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('vale ~0 para vectores ortogonales', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('es invariante a la escala (misma dirección → 1)', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
  });

  it('devuelve 0 ante longitudes distintas o vectores vacíos', () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
    expect(cosine([], [1])).toBe(0);
    expect(cosine([0, 0], [0, 0])).toBe(0); // norma cero → 0, no NaN
  });
});

describe('AiSearch — rankHits', () => {
  const rows: EmbeddingRow[] = [
    { kind: 'document', refId: 'd1', refLabel: 'Contrato.docx · EXP-1', content: 'cláusula de no competencia', embedding: [1, 0, 0] },
    { kind: 'document', refId: 'd1', refLabel: 'Contrato.docx · EXP-1', content: 'objeto del contrato', embedding: [0.9, 0.1, 0] },
    { kind: 'matter', refId: 'm1', refLabel: 'EXP-1 — Fusión', content: 'expediente de fusión', embedding: [0, 1, 0] },
    { kind: 'document', refId: 'd2', refLabel: 'Anexo.docx · EXP-2', content: 'anexo económico', embedding: [0, 0, 1] },
  ];

  it('ordena por similitud coseno descendente', () => {
    const hits = rankHits([1, 0, 0], rows, 10);
    expect(hits[0]!.refId).toBe('d1');
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('deduplica por kind:refId quedándose con el mejor fragmento de cada referencia', () => {
    const hits = rankHits([1, 0, 0], rows, 10);
    const d1 = hits.filter((h) => h.kind === 'document' && h.refId === 'd1');
    expect(d1).toHaveLength(1);
    // El mejor fragmento de d1 con la consulta [1,0,0] es "cláusula de no competencia".
    expect(d1[0]!.excerpt).toBe('cláusula de no competencia');
  });

  it('respeta el límite de resultados', () => {
    const hits = rankHits([1, 1, 1], rows, 2);
    expect(hits).toHaveLength(2);
  });

  it('mezcla resultados de documentos y expedientes en el mismo ranking', () => {
    const hits = rankHits([0, 1, 0], rows, 10);
    expect(hits[0]!.kind).toBe('matter'); // el vector [0,1,0] casa con el expediente m1
    expect(hits.some((h) => h.kind === 'document')).toBe(true);
  });
});
