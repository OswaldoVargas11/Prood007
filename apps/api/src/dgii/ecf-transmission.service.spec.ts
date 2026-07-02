import { EcfStatus } from '@prisma/client';
import { EcfTransmissionService } from './ecf-transmission.service';

/**
 * Transiciones de estado e idempotencia de la transmisión e-CF, con Prisma/DGII mockeados:
 *  - un e-CF ACCEPTED o en trámite (PENDING + TrackId) NUNCA se reenvía (no duplica el comprobante);
 *  - un fallo de transporte deja PENDING con el intento contado (lo reintenta el cron con backoff);
 *  - el acuse final (ACCEPTED/REJECTED) se persiste y queda en la cadena fiscal (FiscalEvent);
 *  - el agotamiento del tope cierra la fase de envío como REJECTED con causa clara.
 */

interface Overrides {
  invoice?: Record<string, unknown>;
  submit?: jest.Mock;
  getStatus?: jest.Mock;
  enabled?: boolean;
  cert?: unknown;
}

const BASE_INVOICE = {
  id: 'inv1',
  number: 'E310000000001',
  complianceFormat: 'ECF',
  complianceRecord: { ecfXml: '<ECF/>' },
  ecfStatus: EcfStatus.STUBBED,
  ecfTrackId: null as string | null,
  ecfAttempts: 0,
};

function makeService(over: Overrides = {}) {
  const invoice = { ...BASE_INVOICE, ...(over.invoice ?? {}) };
  // Transacción de persistencia: update + evento fiscal encadenado bajo el advisory lock.
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    invoice: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fiscalEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    invoice: {
      findFirst: jest.fn().mockResolvedValue(invoice),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const config = { enabled: over.enabled ?? true, env: 'test' };
  const submit =
    over.submit ??
    jest.fn().mockResolvedValue({
      status: 'PENDING',
      externalId: 'TRK-1',
      detail: 'enviado',
      timestamp: 'now',
    });
  const getStatus =
    over.getStatus ??
    jest.fn().mockResolvedValue({
      status: 'PENDING',
      externalId: 'TRK-1',
      detail: 'En Proceso',
      timestamp: 'now',
    });
  const credentials = {
    getCert: jest
      .fn()
      .mockResolvedValue(over.cert === undefined ? { p12: 'x', pass: 'y' } : over.cert),
  };
  const service = new EcfTransmissionService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { submit, getStatus } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credentials as any,
  );
  return { service, prisma, tx, submit, getStatus };
}

describe('EcfTransmissionService.transmit — idempotencia', () => {
  it('una factura ACCEPTED nunca se retransmite (sin submit, sin escrituras)', async () => {
    const { service, tx, submit, prisma } = makeService({
      invoice: { ecfStatus: EcfStatus.ACCEPTED, ecfTrackId: 'TRK-9' },
    });
    const out = await service.transmit('t1', 'inv1');
    expect(out).toEqual({ status: EcfStatus.ACCEPTED, trackId: 'TRK-9' });
    expect(submit).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('en trámite (PENDING + TrackId) NO reenvía: consulta el acuse (no duplica el envío)', async () => {
    const { service, submit, getStatus } = makeService({
      invoice: { ecfStatus: EcfStatus.PENDING, ecfTrackId: 'TRK-9' },
    });
    await service.transmit('t1', 'inv1');
    expect(submit).not.toHaveBeenCalled();
    expect(getStatus).toHaveBeenCalledWith('TRK-9', expect.anything());
  });
});

describe('EcfTransmissionService.transmit — envío', () => {
  it('envío OK → PENDING con TrackId, contador a 0 y evento ecf.transmitted en la cadena', async () => {
    const { service, tx } = makeService();
    const out = await service.transmit('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.PENDING);
    expect(out.trackId).toBe('TRK-1');
    expect(tx.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ecfStatus: EcfStatus.PENDING,
          ecfTrackId: 'TRK-1',
          ecfAttempts: 0,
        }),
      }),
    );
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ecf.transmitted', invoiceId: 'inv1' }),
      }),
    );
  });

  it('fallo de transporte → PENDING sin TrackId, intento contado y evento ecf.transmit_failed', async () => {
    const submit = jest.fn().mockResolvedValue({
      status: 'PENDING',
      detail: 'Error transmitiendo a la DGII (se reintentará): timeout',
      timestamp: 'now',
    });
    const { service, tx } = makeService({ submit, invoice: { ecfAttempts: 2 } });
    const out = await service.transmit('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.PENDING);
    expect(out.trackId).toBeNull();
    const data = tx.invoice.updateMany.mock.calls[0][0].data;
    expect(data.ecfStatus).toBe(EcfStatus.PENDING);
    expect(data.ecfAttempts).toBe(3);
    expect(data.ecfTrackId).toBeUndefined(); // sin TrackId: sigue en fase de envío
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ecf.transmit_failed' }),
      }),
    );
  });

  it('sin DGII_ENV queda STUBBED sin evento (comportamiento actual intacto)', async () => {
    const { service, tx, prisma, submit } = makeService({ enabled: false });
    const out = await service.transmit('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.STUBBED);
    expect(submit).not.toHaveBeenCalled();
    expect(prisma.invoice.updateMany).toHaveBeenCalled(); // update simple…
    expect(tx.fiscalEvent.create).not.toHaveBeenCalled(); // …sin evento fiscal
  });
});

describe('EcfTransmissionService.refresh — transición PENDING→ACCEPTED/REJECTED', () => {
  const pendingWithTrack = { ecfStatus: EcfStatus.PENDING, ecfTrackId: 'TRK-1', ecfAttempts: 4 };

  it('acuse ACEPTADO → persiste ACCEPTED, resetea el contador y encadena ecf.accepted', async () => {
    const getStatus = jest
      .fn()
      .mockResolvedValue({ status: 'ACCEPTED', externalId: 'TRK-1', detail: 'Aceptado' });
    const { service, tx } = makeService({ getStatus, invoice: pendingWithTrack });
    const out = await service.refresh('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.ACCEPTED);
    const data = tx.invoice.updateMany.mock.calls[0][0].data;
    expect(data.ecfStatus).toBe(EcfStatus.ACCEPTED);
    expect(data.ecfAttempts).toBe(0);
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ecf.accepted' }) }),
    );
  });

  it('acuse RECHAZADO → persiste REJECTED con el motivo y encadena ecf.rejected', async () => {
    const getStatus = jest
      .fn()
      .mockResolvedValue({ status: 'REJECTED', externalId: 'TRK-1', detail: 'Rechazado: RNC' });
    const { service, tx } = makeService({ getStatus, invoice: pendingWithTrack });
    const out = await service.refresh('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.REJECTED);
    const data = tx.invoice.updateMany.mock.calls[0][0].data;
    expect(data.ecfStatus).toBe(EcfStatus.REJECTED);
    expect(data.ecfStatusDetail).toBe('Rechazado: RNC');
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ecf.rejected' }) }),
    );
  });

  it('sigue en trámite → cuenta la consulta (tope del cron) SIN evento en la cadena', async () => {
    const { service, tx, prisma } = makeService({ invoice: pendingWithTrack });
    const out = await service.refresh('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.PENDING);
    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ecfAttempts: 5 }) }),
    );
    expect(tx.fiscalEvent.create).not.toHaveBeenCalled();
  });

  it('ACCEPTED ya persistido → no consulta (idempotencia del polling)', async () => {
    const { service, getStatus } = makeService({
      invoice: { ecfStatus: EcfStatus.ACCEPTED, ecfTrackId: 'TRK-1' },
    });
    const out = await service.refresh('t1', 'inv1');
    expect(out.status).toBe(EcfStatus.ACCEPTED);
    expect(getStatus).not.toHaveBeenCalled();
  });
});

describe('EcfTransmissionService.markRetryExhausted', () => {
  it('fase de ENVÍO agotada → REJECTED con causa y evento ecf.retry_exhausted', async () => {
    const { service, tx } = makeService({
      invoice: { ecfStatus: EcfStatus.PENDING, ecfTrackId: null, ecfAttempts: 8 },
    });
    await service.markRetryExhausted('t1', 'inv1');
    const data = tx.invoice.updateMany.mock.calls[0][0].data;
    expect(data.ecfStatus).toBe(EcfStatus.REJECTED);
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ecf.retry_exhausted' }) }),
    );
  });

  it('fase de ACUSE agotada → sigue PENDING (no es un rechazo) con nota manual Y evento encadenado', async () => {
    const { service, tx } = makeService({
      invoice: { ecfStatus: EcfStatus.PENDING, ecfTrackId: 'TRK-1', ecfAttempts: 8 },
    });
    await service.markRetryExhausted('t1', 'inv1');
    // El contador queda por ENCIMA del tope: el barrido del cron (filtro lte tope) ya no la recarga.
    const data = tx.invoice.updateMany.mock.calls[0][0].data;
    expect(data.ecfStatus).toBe(EcfStatus.PENDING);
    expect(data.ecfAttempts).toBe(9);
    // El agotamiento del acuse es un hecho fiscal: queda en la cadena (a diferencia del polling).
    expect(tx.fiscalEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ecf.retry_exhausted' }) }),
    );
  });

  it('si la factura ya salió de PENDING no toca nada', async () => {
    const { service, tx, prisma } = makeService({
      invoice: { ecfStatus: EcfStatus.ACCEPTED, ecfTrackId: 'TRK-1', ecfAttempts: 8 },
    });
    await service.markRetryExhausted('t1', 'inv1');
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});
