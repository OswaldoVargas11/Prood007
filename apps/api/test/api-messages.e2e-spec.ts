import { API_MESSAGES, SUPPORTED_LOCALES, apiError } from '../src/common/api-messages';

/**
 * Gate del catálogo i18n de la API (E8): garantiza que TODA messageKey tiene traducción COMPLETA en
 * las dos jurisdicciones (`es-ES`, `es-DO`). No necesita base de datos; corre bajo el runner e2e.
 */
describe('Catálogo i18n de la API (E8)', () => {
  const keys = Object.keys(API_MESSAGES) as (keyof typeof API_MESSAGES)[];

  it('hay claves en el catálogo', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('la clave "%s" tiene traducción no vacía en es-ES y es-DO', (key) => {
    const entry = API_MESSAGES[key] as Record<string, string | undefined>;
    for (const locale of SUPPORTED_LOCALES) {
      const text = entry[locale];
      expect(typeof text).toBe('string');
      expect((text ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('las plantillas con marcadores usan el MISMO conjunto de placeholders en ambos locales', () => {
    const placeholders = (s: string) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');
    for (const key of keys) {
      const entry = API_MESSAGES[key] as Record<string, string | undefined>;
      expect(placeholders(entry['es-DO'] ?? '')).toBe(placeholders(entry['es-ES'] ?? ''));
    }
  });

  it('apiError adjunta messageKey + message fallback (es-ES) y params/code opcionales', () => {
    const basic = apiError('auth.invalidCredentials');
    expect(basic.messageKey).toBe('auth.invalidCredentials');
    expect(basic.message).toBe(API_MESSAGES['auth.invalidCredentials']['es-ES']);

    const rich = apiError('matters.invalidTransition', {
      message: 'Transición de estado no permitida: OPEN → ARCHIVED.',
      params: { from: 'OPEN', to: 'ARCHIVED' },
      code: 'INVALID_TRANSITION',
    });
    expect(rich.messageKey).toBe('matters.invalidTransition');
    expect(rich.message).toContain('OPEN');
    expect(rich.params).toEqual({ from: 'OPEN', to: 'ARCHIVED' });
    expect(rich.code).toBe('INVALID_TRANSITION');
  });
});
