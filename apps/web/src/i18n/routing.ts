import { defineRouting } from 'next-intl/routing';

/**
 * Enrutado i18n. UN SOLO idioma (`es`): España y RD comparten español. Lo que cambia entre
 * jurisdicciones (ITBIS↔IVA, nota de crédito↔rectificativa…) NO es idioma sino JURISDICCIÓN, y se
 * resuelve en `i18n/request.ts` fusionando `messages/overrides/<jur>.json` sobre `messages/es.json`
 * según la cookie `lf_jur`. Las URLs viejas `/es-ES` y `/es-DO` redirigen 301 a `/es` (middleware).
 */
export const routing = defineRouting({
  locales: ['es'],
  defaultLocale: 'es',
});

export type AppLocale = (typeof routing.locales)[number];
