import {
  annotateWithCitations,
  parseCitationCheck,
  buildCitationCheckUser,
  type Citation,
} from './ai-citations';

const json = (v: unknown) => JSON.stringify(v);

describe('annotateWithCitations', () => {
  it('la cronología de un expediente produce una cita de expediente RESOLUBLE', () => {
    const registry: Citation[] = [];
    const out = annotateWithCitations(
      'get_matter_timeline',
      { content: json({ found: true, matter: 'EXP-2026-0042', eventCount: 2, events: [] }) },
      registry,
    );
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({ n: 1, kind: 'matter', refId: 'EXP-2026-0042' });
    // El contenido que ve el modelo lleva el marcador de cita para poder citar con [1].
    expect(JSON.parse(out.content)).toMatchObject({ citation: 1 });
  });

  it('los fragmentos del RAG producen citas de documento con su fragmento (quote)', () => {
    const registry: Citation[] = [];
    const out = annotateWithCitations(
      'search_firm_knowledge',
      {
        content: json({
          count: 1,
          hits: [
            {
              kind: 'document',
              refId: 'doc-1',
              ref: 'Contrato · EXP-1',
              excerpt: 'cláusula de no competencia',
              score: 0.9,
            },
          ],
        }),
      },
      registry,
    );
    expect(registry[0]).toMatchObject({
      n: 1,
      kind: 'document',
      refId: 'doc-1',
      quote: 'cláusula de no competencia',
    });
    expect(JSON.parse(out.content).hits[0]).toMatchObject({ cite: 1 });
  });

  it('la ficha de expediente (get_matter) cita con etiqueta legible', () => {
    const registry: Citation[] = [];
    annotateWithCitations(
      'get_matter',
      { content: json({ found: true, reference: 'EXP-1', title: 'Compraventa', status: 'OPEN' }) },
      registry,
    );
    expect(registry[0]).toMatchObject({
      kind: 'matter',
      refId: 'EXP-1',
      label: 'EXP-1 — Compraventa',
    });
  });

  it('deduplica: la misma fuente reutiliza el mismo número [n]', () => {
    const registry: Citation[] = [];
    const content = json({ found: true, reference: 'EXP-1', title: 'X', status: 'OPEN' });
    annotateWithCitations('get_matter', { content }, registry);
    annotateWithCitations('get_matter', { content }, registry);
    expect(registry).toHaveLength(1);
  });

  it('numera de forma incremental fuentes distintas', () => {
    const registry: Citation[] = [];
    annotateWithCitations(
      'search_matters',
      {
        content: json({
          matters: [
            { reference: 'EXP-1', title: 'A' },
            { reference: 'EXP-2', title: 'B' },
          ],
        }),
      },
      registry,
    );
    expect(registry.map((c) => c.n)).toEqual([1, 2]);
  });

  it('no toca resultados de error ni contenido no-JSON (robustez del turno)', () => {
    const registry: Citation[] = [];
    const err = annotateWithCitations('x', { content: 'boom', isError: true }, registry);
    expect(err).toEqual({ content: 'boom', isError: true });
    const plain = annotateWithCitations('x', { content: 'no soy json' }, registry);
    expect(plain).toEqual({ content: 'no soy json' });
    expect(registry).toHaveLength(0);
  });

  it('un resultado sin referencias citables no altera el contenido', () => {
    const registry: Citation[] = [];
    const out = annotateWithCitations(
      'firm_overview',
      { content: json({ activeMatters: 3, openTasks: 5 }) },
      registry,
    );
    expect(registry).toHaveLength(0);
    expect(JSON.parse(out.content)).toEqual({ activeMatters: 3, openTasks: 5 });
  });
});

describe('parseCitationCheck', () => {
  it('extrae verified/flagged del JSON del verificador', () => {
    expect(parseCitationCheck('{"verified": false, "flagged": ["dice X sin cita"]}')).toEqual({
      verified: false,
      flagged: ['dice X sin cita'],
    });
  });
  it('ante salida no-JSON, no marca nada (verified=true)', () => {
    expect(parseCitationCheck('no devolví json')).toEqual({ verified: true, flagged: [] });
  });
});

describe('buildCitationCheckUser', () => {
  it('incluye la respuesta y las fuentes citadas', () => {
    const msg = buildCitationCheckUser('El estado es OPEN [1].', [
      { n: 1, kind: 'matter', refId: 'EXP-1', label: 'EXP-1 — X', tool: 'get_matter' },
    ]);
    expect(msg).toContain('El estado es OPEN [1].');
    expect(msg).toContain('[1] (matter) EXP-1 — X');
  });
});
