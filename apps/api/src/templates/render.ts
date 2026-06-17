/**
 * Render de plantillas de documento por SUSTITUCIÓN de marcadores `{{campo}}` (sin evaluación de
 * código: solo reemplazo literal desde un mapa cerrado de valores). Seguro frente a inyección.
 *
 * Marcadores admitidos (clave → valor): los que construye `buildTemplateContext` (cliente/expediente/
 * despacho/fecha). Un marcador desconocido se sustituye por cadena vacía (no se deja el `{{...}}` ni
 * se ejecuta nada). Tolerante a espacios: `{{ cliente.nombre }}` == `{{cliente.nombre}}`.
 */
export type TemplateContext = Record<string, string>;

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(body: string, context: TemplateContext): string {
  return body.replace(TOKEN, (_match, key: string) => context[key] ?? '');
}

/** Lista de marcadores que aparecen en el cuerpo (para previsualización/ayuda en la UI). */
export function extractTokens(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(TOKEN)) found.add(m[1]!);
  return [...found];
}
