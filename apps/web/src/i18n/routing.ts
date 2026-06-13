import { defineRouting } from 'next-intl/routing';

/**
 * Enrutado i18n. Locales soportados desde el día uno: España y República Dominicana.
 * Nada de strings hardcodeados en UI: todo pasa por los catálogos en `messages/`.
 */
export const routing = defineRouting({
  locales: ['es-ES', 'es-DO'],
  defaultLocale: 'es-ES',
});

export type AppLocale = (typeof routing.locales)[number];
