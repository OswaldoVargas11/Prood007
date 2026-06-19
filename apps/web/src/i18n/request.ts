import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { cookies } from 'next/headers';
import { routing } from './routing';
import base from '../../messages/es.json';
import doOverride from '../../messages/overrides/do.json';

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fusión profunda: el override (hojas, incluidos arrays) gana sobre la base; estructura idéntica. */
function deepMerge(target: Json, override: Json): Json {
  const out: Json = { ...target };
  for (const key of Object.keys(override)) {
    const o = override[key];
    const t = out[key];
    out[key] = isPlainObject(o) && isPlainObject(t) ? deepMerge(t, o) : o;
  }
  return out;
}

/**
 * Un solo idioma (`es`). La TERMINOLOGÍA FISCAL depende de la JURISDICCIÓN del despacho, no del idioma:
 * si la cookie `lf_jur` es `do`, fusionamos el override dominicano (ITBIS, nota de crédito, ISR…) sobre
 * el catálogo base. Sin cookie (sesión vieja o público) → base (España). La cookie se fija al login/refresh.
 */
export default getRequestConfig(async () => {
  const jur = (await cookies()).get('lf_jur')?.value;
  const messages =
    jur === 'do'
      ? deepMerge(base as unknown as Json, doOverride as unknown as Json)
      : (base as unknown as Json);
  // El catálogo usa algunos arrays (p. ej. proBenefits) que el tipo estricto de next-intl no modela;
  // el código original colaba por usar import dinámico (any). Casteamos al tipo que espera next-intl.
  return { locale: routing.defaultLocale, messages: messages as unknown as AbstractIntlMessages };
});
