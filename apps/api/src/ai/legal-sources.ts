/**
 * Investigación jurídica del asistente agéntico: enlaces a FUENTES OFICIALES públicas por jurisdicción,
 * con los términos de búsqueda ya cargados. Deliberadamente NO descarga ni reproduce contenido (evita
 * problemas de copyright/ToS y "alucinación" de jurisprudencia): apunta a la fuente primaria para que el
 * letrado la consulte y verifique. Réplica backend de `apps/web/.../legal-research-links.tsx`, para que
 * el agente pueda ofrecer estos enlaces. La ingesta + embeddings (RAG real sobre el texto) queda como
 * evolución futura — ver docs/architecture/ADR-001-agentic-ai.md.
 */

export type LegalJurisdiction = 'es' | 'do';

export interface LegalSourceLink {
  source: string;
  kind: string;
  url: string;
}

/** Búsqueda acotada a un portal vía Google (deep-link fiable aunque el portal no exponga búsqueda por URL). */
function siteSearch(site: string, query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${query}`)}`;
}

/** Enlaces a fuentes jurídicas oficiales (jurisprudencia + legislación) para la jurisdicción dada. */
export function legalSourceLinks(
  jurisdiction: LegalJurisdiction,
  query: string,
): LegalSourceLink[] {
  const q = query.trim();
  if (jurisdiction === 'do') {
    return [
      {
        source: 'Poder Judicial RD',
        kind: 'jurisprudencia',
        url: siteSearch('poderjudicial.gob.do', q),
      },
      { source: 'DGII', kind: 'normativa fiscal', url: siteSearch('dgii.gov.do', q) },
      {
        source: 'vLex República Dominicana',
        kind: 'doctrina/jurisprudencia',
        url: `https://vlex.com.do/search?q=${encodeURIComponent(q)}`,
      },
    ];
  }
  return [
    {
      source: 'CENDOJ (Poder Judicial)',
      kind: 'jurisprudencia',
      url: siteSearch('poderjudicial.es', q),
    },
    { source: 'BOE', kind: 'legislación', url: siteSearch('boe.es', q) },
    {
      source: 'vLex España',
      kind: 'doctrina/jurisprudencia',
      url: `https://vlex.es/search?q=${encodeURIComponent(q)}`,
    },
  ];
}
