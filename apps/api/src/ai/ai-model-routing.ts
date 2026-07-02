/**
 * Enrutado por complejidad: tareas de baja complejidad (resúmenes cortos, verificación de citas) usan un
 * modelo más BARATO que el agente conversacional principal (`AI_MODEL`). No es un framework de routing
 * genérico — solo el punto único donde vive el default, para no repetirlo en cada call site.
 */
export const AI_MODEL_LIGHT_DEFAULT = 'claude-haiku-4-5-20251001';

/** Modelo ligero a usar en las tareas enrutadas (`AI_MODEL_LIGHT`, o el default si no se fija). */
export function resolveLightModel(): string {
  return process.env.AI_MODEL_LIGHT || AI_MODEL_LIGHT_DEFAULT;
}
