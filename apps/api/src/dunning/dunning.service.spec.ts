import { Prisma } from '@prisma/client';
import {
  DunningChannel,
  DunningReminderStatus,
  DunningSeverity,
  Jurisdiction,
} from '@legalflow/domain';
import { DunningService } from './dunning.service';

/**
 * Motor de dunning con Prisma/canales mockeados. Cubre lo que `dunning.policy.spec` (puro) no puede:
 * selección de canal EMAIL, degradación a IN_APP sin credenciales SMTP e idempotencia de reenvío.
 */

const INVOICE = {
  id: 'inv1',
  number: 'FAC-0001',
  total: new Prisma.Decimal(100),
  currency: 'EUR',
  dueDate: new Date('2026-06-01T00:00:00.000Z'),
  status: 'SENT',
  client: { id: 'c1', name: 'Cliente Uno', email: 'cliente@example.test' },
};

function makeService(
  opts: {
    rules?: Array<{ offsetDays: number; severity: DunningSeverity; channel: DunningChannel }>;
    emailEnabled?: boolean;
    createImpl?: () => unknown;
  } = {},
) {
  const reminderCreate = opts.createImpl
    ? jest.fn().mockImplementation(opts.createImpl)
    : jest.fn().mockResolvedValue({ id: 'r1' });
  const reminderUpdate = jest.fn().mockResolvedValue(undefined);

  const prisma = {
    dunningRule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? []) },
    invoice: { findMany: jest.fn().mockResolvedValue([INVOICE]) },
    dunningReminder: { create: reminderCreate, update: reminderUpdate, findMany: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const emailDeliver = jest.fn().mockResolvedValue(undefined);
  const inAppDeliver = jest.fn().mockResolvedValue(undefined);
  const channels = [
    { channel: DunningChannel.IN_APP, isEnabled: () => true, deliver: inAppDeliver },
    {
      channel: DunningChannel.EMAIL,
      isEnabled: () => opts.emailEnabled ?? true,
      deliver: emailDeliver,
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new DunningService(prisma as any, audit as any, channels as any);
  return { service, prisma, audit, emailDeliver, inAppDeliver, reminderCreate, reminderUpdate };
}

describe('DunningService.evaluateTenant', () => {
  const TODAY = new Date('2026-06-20T00:00:00.000Z');

  it('entrega por el canal EMAIL cuando la regla del despacho lo pide', async () => {
    const { service, emailDeliver, inAppDeliver, reminderUpdate } = makeService({
      rules: [{ offsetDays: 1, severity: DunningSeverity.REMINDER, channel: DunningChannel.EMAIL }],
    });

    const summary = await service.evaluateTenant('t1', Jurisdiction.ES);

    expect(emailDeliver).toHaveBeenCalledTimes(1);
    expect(inAppDeliver).not.toHaveBeenCalled();
    expect(reminderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DunningReminderStatus.SENT }),
      }),
    );
    expect(summary.delivered).toBe(1);
  });

  it('degrada a IN_APP sin romper el barrido cuando EMAIL no tiene credenciales (SMTP_HOST ausente)', async () => {
    const { service, emailDeliver, inAppDeliver, reminderUpdate, audit } = makeService({
      rules: [{ offsetDays: 1, severity: DunningSeverity.REMINDER, channel: DunningChannel.EMAIL }],
      emailEnabled: false,
    });

    const summary = await service.evaluateTenant('t1', Jurisdiction.ES);

    expect(emailDeliver).not.toHaveBeenCalled();
    expect(inAppDeliver).toHaveBeenCalledTimes(1);
    expect(summary.delivered).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(reminderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DunningReminderStatus.SENT,
          metadata: { degradedTo: DunningChannel.IN_APP, reason: 'channel_unavailable' },
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.anything(),
      'dunning.reminder_sent',
      'DunningReminder',
      'r1',
      expect.objectContaining({
        channel: DunningChannel.EMAIL,
        deliveredChannel: DunningChannel.IN_APP,
      }),
    );
  });

  it('no reenvía la misma etapa (colisión P2002 en el `create` se resuelve con gracia)', async () => {
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    const { service, emailDeliver, inAppDeliver } = makeService({
      rules: [{ offsetDays: 1, severity: DunningSeverity.REMINDER, channel: DunningChannel.EMAIL }],
      createImpl: () => {
        throw dup;
      },
    });

    const summary = await service.evaluateTenant('t1', Jurisdiction.ES);

    expect(emailDeliver).not.toHaveBeenCalled();
    expect(inAppDeliver).not.toHaveBeenCalled();
    expect(summary.created).toBe(0);
    expect(summary.delivered).toBe(0);
  });

  it('marca SKIPPED (sin lanzar) si ni EMAIL ni el respaldo IN_APP están operativos', async () => {
    const reminderUpdate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      dunningRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { offsetDays: 1, severity: DunningSeverity.REMINDER, channel: DunningChannel.EMAIL },
          ]),
      },
      invoice: { findMany: jest.fn().mockResolvedValue([INVOICE]) },
      dunningReminder: {
        create: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: reminderUpdate,
        findMany: jest.fn(),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const channels = [
      { channel: DunningChannel.IN_APP, isEnabled: () => false, deliver: jest.fn() },
      { channel: DunningChannel.EMAIL, isEnabled: () => false, deliver: jest.fn() },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DunningService(prisma as any, audit as any, channels as any);

    const summary = await service.evaluateTenant('t1', Jurisdiction.ES);

    expect(summary.skipped).toBe(1);
    expect(reminderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: DunningReminderStatus.SKIPPED,
          metadata: { reason: 'channel_unavailable' },
        },
      }),
    );
  });
});

describe('DunningService rules — configuración por despacho', () => {
  it('sin reglas configuradas, expone el calendario por defecto (todo IN_APP)', async () => {
    const { service } = makeService({ rules: [] });
    const result = await service.getRules({
      tenantId: 't1',
      jurisdiction: Jurisdiction.ES,
    } as never);
    expect(result.custom).toBe(false);
    expect(result.rules.every((r) => r.channel === DunningChannel.IN_APP)).toBe(true);
  });

  it('actualiza el canal de una etapa a EMAIL (opt-in) vía upsert', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      dunningRule: { findMany: jest.fn().mockResolvedValue([]), upsert },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new DunningService(prisma as any, audit as any, []);

    await service.updateRules({ tenantId: 't1', jurisdiction: Jurisdiction.ES } as never, {
      rules: [{ severity: DunningSeverity.WARNING, channel: DunningChannel.EMAIL }],
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_offsetDays: { tenantId: 't1', offsetDays: 7 } },
        update: expect.objectContaining({ channel: DunningChannel.EMAIL }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.anything(),
      'dunning.rules_updated',
      'Tenant',
      't1',
      expect.anything(),
    );
  });
});
