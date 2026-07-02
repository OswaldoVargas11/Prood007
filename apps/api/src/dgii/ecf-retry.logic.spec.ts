import {
  ECF_MAX_AUTO_ATTEMPTS,
  ECF_RETRY_BASE_MS,
  ECF_RETRY_MAX_DELAY_MS,
  decideEcfRetry,
  ecfRetryDelayMs,
} from './ecf-retry.logic';

/**
 * Lógica pura del cron de reintento e-CF: backoff exponencial con techo, tope de intentos y elección de
 * fase (retransmitir vs consultar acuse) según haya TrackId.
 */
describe('ecfRetryDelayMs', () => {
  it('backoff exponencial: 5 min, 10, 20… con techo de 6 h', () => {
    expect(ecfRetryDelayMs(0)).toBe(ECF_RETRY_BASE_MS);
    expect(ecfRetryDelayMs(1)).toBe(2 * ECF_RETRY_BASE_MS);
    expect(ecfRetryDelayMs(2)).toBe(4 * ECF_RETRY_BASE_MS);
    expect(ecfRetryDelayMs(20)).toBe(ECF_RETRY_MAX_DELAY_MS);
  });
});

describe('decideEcfRetry', () => {
  const now = new Date('2026-07-02T12:00:00.000Z');
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it('fase de ENVÍO (sin TrackId) con backoff cumplido → retry', () => {
    expect(
      decideEcfRetry({ ecfAttempts: 0, ecfSubmittedAt: minutesAgo(6), ecfTrackId: null }, now),
    ).toBe('retry');
  });

  it('fase de ACUSE (con TrackId) con backoff cumplido → poll', () => {
    expect(
      decideEcfRetry({ ecfAttempts: 0, ecfSubmittedAt: minutesAgo(6), ecfTrackId: 'TRK-1' }, now),
    ).toBe('poll');
  });

  it('dentro de la ventana de backoff → wait (no insiste en cada barrido)', () => {
    expect(
      decideEcfRetry({ ecfAttempts: 0, ecfSubmittedAt: minutesAgo(4), ecfTrackId: null }, now),
    ).toBe('wait');
    // Con 2 intentos la espera es de 20 min: a los 15 min aún toca esperar.
    expect(
      decideEcfRetry({ ecfAttempts: 2, ecfSubmittedAt: minutesAgo(15), ecfTrackId: null }, now),
    ).toBe('wait');
    expect(
      decideEcfRetry({ ecfAttempts: 2, ecfSubmittedAt: minutesAgo(21), ecfTrackId: null }, now),
    ).toBe('retry');
  });

  it('tope de intentos automáticos → exhausted (gana al backoff)', () => {
    expect(
      decideEcfRetry(
        { ecfAttempts: ECF_MAX_AUTO_ATTEMPTS, ecfSubmittedAt: minutesAgo(9999), ecfTrackId: null },
        now,
      ),
    ).toBe('exhausted');
    expect(
      decideEcfRetry(
        {
          ecfAttempts: ECF_MAX_AUTO_ATTEMPTS + 3,
          ecfSubmittedAt: minutesAgo(1),
          ecfTrackId: 'TRK-1',
        },
        now,
      ),
    ).toBe('exhausted');
  });

  it('sin sello de intento previo actúa ya (sin backoff que computar)', () => {
    expect(decideEcfRetry({ ecfAttempts: 0, ecfSubmittedAt: null, ecfTrackId: null }, now)).toBe(
      'retry',
    );
  });
});
