import { EcfRetryCron } from './ecf-retry.cron';
import { ECF_MAX_AUTO_ATTEMPTS } from './ecf-retry.logic';

/**
 * Barrido del cron de reintento e-CF con dependencias mockeadas: enruta cada factura PENDING a su
 * acción (retransmitir / consultar acuse / esperar backoff / cerrar por agotamiento) y un fallo en una
 * factura no detiene el barrido. La idempotencia fina (no re-enviar con TrackId) vive en el servicio
 * de transmisión y se cubre en `ecf-transmission.service.spec`.
 */

const NOW = new Date('2026-07-02T12:00:00.000Z');
const OLD = new Date('2026-07-02T10:00:00.000Z'); // backoff sobradamente cumplido

function makeCron(invoices: unknown[], over: { enabled?: boolean } = {}) {
  const system = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
  const config = { enabled: over.enabled ?? true, env: 'test' };
  const transmission = {
    transmit: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    refresh: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
    markRetryExhausted: jest.fn().mockResolvedValue(undefined),
  };
  const cron = new EcfRetryCron(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    system as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transmission as any,
  );
  return { cron, system, transmission };
}

const inv = (id: string, p: Partial<Record<string, unknown>> = {}) => ({
  id,
  tenantId: 't1',
  ecfAttempts: 0,
  ecfSubmittedAt: OLD,
  ecfTrackId: null,
  ...p,
});

describe('EcfRetryCron.sweep', () => {
  it('enruta: sin TrackId → retransmite; con TrackId → consulta acuse; reciente → espera', async () => {
    const { cron, transmission } = makeCron([
      inv('a'), // fase de envío, backoff cumplido
      inv('b', { ecfTrackId: 'TRK-B' }), // fase de acuse
      inv('c', { ecfSubmittedAt: new Date(NOW.getTime() - 60_000) }), // hace 1 min: backoff
    ]);
    const s = await cron.sweep(NOW);
    expect(transmission.transmit).toHaveBeenCalledTimes(1);
    expect(transmission.transmit).toHaveBeenCalledWith('t1', 'a');
    expect(transmission.refresh).toHaveBeenCalledTimes(1);
    expect(transmission.refresh).toHaveBeenCalledWith('t1', 'b');
    expect(s).toEqual({
      candidates: 3,
      retried: 1,
      polled: 1,
      waiting: 1,
      exhausted: 0,
      failed: 0,
    });
  });

  it('tope alcanzado → cierra la fase UNA sola vez (solo en el tope exacto)', async () => {
    const { cron, transmission } = makeCron([
      inv('a', { ecfAttempts: ECF_MAX_AUTO_ATTEMPTS }),
      // Ya cerrada en un barrido anterior (contador por encima del tope): se ignora sin tocarla.
      inv('b', { ecfAttempts: ECF_MAX_AUTO_ATTEMPTS + 1, ecfTrackId: 'TRK-B' }),
    ]);
    const s = await cron.sweep(NOW);
    expect(transmission.markRetryExhausted).toHaveBeenCalledTimes(1);
    expect(transmission.markRetryExhausted).toHaveBeenCalledWith('t1', 'a');
    expect(transmission.transmit).not.toHaveBeenCalled();
    expect(transmission.refresh).not.toHaveBeenCalled();
    expect(s.exhausted).toBe(2);
  });

  it('un fallo en una factura no detiene el barrido (se cuenta y se continúa)', async () => {
    const { cron, transmission } = makeCron([inv('a'), inv('b', { ecfTrackId: 'TRK-B' })]);
    transmission.transmit.mockRejectedValueOnce(new Error('DB transitorio'));
    const s = await cron.sweep(NOW);
    expect(s.failed).toBe(1);
    expect(transmission.refresh).toHaveBeenCalledWith('t1', 'b');
  });
});
