/**
 * Conector LexNET — GATED. La integración oficial con LexNET / sede judicial electrónica requiere
 * acreditación ante el CGPJ y certificado de "sistema de gestión procesal"; no hay API pública abierta.
 * Sin `LEXNET_ENABLED=true` + endpoint configurado, el conector queda inerte y la bandeja funciona en
 * modo manual/importación. Ver LEXNET_SETUP.md.
 */
export function lexnetEnabled(): boolean {
  return process.env.LEXNET_ENABLED === 'true' && Boolean(process.env.LEXNET_ENDPOINT);
}

export function lexnetConfig(): { enabled: boolean; endpoint: string | null } {
  return { enabled: lexnetEnabled(), endpoint: process.env.LEXNET_ENDPOINT ?? null };
}
