/**
 * Normaliza un valor de query string del callback OAuth a una ÚNICA cadena.
 *
 * Seguridad (LAW-72, CodeQL `js/type-confusion-through-parameter-tampering`): Express/`qs` parsea
 * `?state=a&state=b` (o `?state[]=a`) como un ARRAY, no como string. El tipo estático dice `string` pero
 * en runtime puede ser `string[]` (u objeto anidado). Si ese valor llega a `verifyState` sin normalizar,
 * `state.lastIndexOf('.')` / `state.slice(...)` se ejecutan como operaciones de array — confusión de tipo
 * explotable por manipulación del atacante. Forzamos el tipo esperado en el BORDE: sólo aceptamos un
 * string; cualquier otra forma (array, objeto, undefined) se descarta y el flujo aborta como OAuth error.
 */
export function firstQueryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
