import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS, selectAgentTools } from './ai-agent.tools';

/**
 * Conformidad del CATÁLOGO del agente: garantías estructurales que evitan clases enteras de bugs
 * (nombres duplicados, schemas inválidos, `required` que no existe en `properties`). El que cada
 * herramienta esté además MANEJADA por el executor se verifica en ai-agent.service.spec.ts.
 */
describe('AGENT_TOOLS (catálogo del agente)', () => {
  it('los nombres son únicos y con formato de snake_case', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z_]+$/);
  });

  it('cada herramienta tiene descripción útil y un input schema de objeto coherente', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      const schema = tool.inputSchema as {
        type?: string;
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(schema.type).toBe('object');
      expect(typeof schema.properties).toBe('object');
      // Todo campo `required` debe existir en `properties` (si no, el modelo no podría cumplirlo).
      const props = Object.keys(schema.properties ?? {});
      for (const req of schema.required ?? []) expect(props).toContain(req);
    }
  });

  it('el prompt de sistema es sustancial y prohíbe inventar (anti-alucinación)', () => {
    expect(AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(200);
    expect(AGENT_SYSTEM_PROMPT.toLowerCase()).toContain('inventes');
  });
});

describe('selectAgentTools (exposición diferida)', () => {
  const names = (msg: string) => selectAgentTools(msg).map((t) => t.name);

  it('siempre expone el núcleo y las áreas cotidianas; oculta las de nicho por defecto', () => {
    const n = names('¿qué tengo pendiente?');
    expect(n).toContain('search_matters'); // núcleo
    expect(n).toContain('find_client'); // área cotidiana (clients)
    expect(n).not.toContain('get_closing_checklists'); // nicho (closing) no pedido
  });

  it('activa un área de nicho cuando el mensaje la menciona', () => {
    expect(names('prepara el cierre del expediente')).toContain('get_closing_checklists');
    expect(names('busca una cláusula de indemnización')).toContain('list_clauses');
  });

  it('nunca expone más que el catálogo completo', () => {
    expect(
      selectAgentTools('cierre cláusula operación data room kyc lead registro').length,
    ).toBeLessThanOrEqual(AGENT_TOOLS.length);
  });
});
