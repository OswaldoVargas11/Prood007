import { DealMilestoneKind } from '@legalflow/domain';
import { DealMilestoneRemindersService } from './milestone-reminders.service';
import { addDaysUtc, startOfTodayUtc } from '../ledger/overdue.util';

/**
 * Avisador de hitos (T-3) a nivel de servicio, con Prisma/notificaciones/auditoría mockeados. Verifica
 * los criterios de aceptación que la lógica pura no cubre: destinatarios SOLO internos (responsable +
 * colaboradores), reutilización del canal in-app existente (NO correo, NO partes externas) e
 * idempotencia (sellado de la ventana avisada).
 */

/** Fecha objetivo a `n` días naturales de hoy (medianoche UTC), igual que el servicio. */
function relTarget(n: number): Date {
  return addDaysUtc(startOfTodayUtc(), n);
}

interface MilestoneRow {
  id: string;
  matterId: string;
  kind: DealMilestoneKind;
  title: string;
  targetDate: Date;
  lastRemindedForTargetDate: Date | null;
  lastReminderWindow: number | null;
  matter: {
    reference: string;
    lawyerId: string | null;
    assignments: { userId: string }[];
  };
}

function makeService(rows: MilestoneRow[]) {
  const update = jest.fn().mockResolvedValue(undefined);
  const create = jest.fn().mockResolvedValue(undefined);
  const log = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    dealMilestone: { findMany: jest.fn().mockResolvedValue(rows), update },
  };
  const notifications = { create };
  const audit = { log };
  const service = new DealMilestoneRemindersService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notifications as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audit as any,
  );
  return { service, create, update, log };
}

function row(over: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: 'm1',
    matterId: 'mat1',
    kind: DealMilestoneKind.CUSTOM,
    title: 'Cierre',
    targetDate: relTarget(5),
    lastRemindedForTargetDate: null,
    lastReminderWindow: null,
    matter: { reference: 'EXP-1', lawyerId: 'law1', assignments: [{ userId: 'col1' }] },
    ...over,
  };
}

describe('DealMilestoneRemindersService', () => {
  it('avisa SOLO al grupo interno (responsable + colaboradores) por el canal in-app', async () => {
    const { service, create, update } = makeService([
      row({ matter: { reference: 'EXP-1', lawyerId: 'law1', assignments: [{ userId: 'col1' }] } }),
    ]);

    const summary = await service.evaluateTenant('t1');

    expect(summary.reminded).toBe(1);
    const recipients = create.mock.calls.map((c) => c[0].userId).sort();
    expect(recipients).toEqual(['col1', 'law1']);
    // Reutiliza el canal existente: notificación in-app tipada, sin proveedor de correo inyectado.
    for (const call of create.mock.calls) {
      expect(call[0].type).toBe('deal.milestone_due_soon');
      expect(call[0].tenantId).toBe('t1');
    }
    // Sella la ventana avisada (a 5 días → ventana 7) para idempotencia.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.lastReminderWindow).toBe(7);
  });

  it('NO duplica un plazo ya avisado en la misma ventana', async () => {
    const targetDate = relTarget(5);
    const { service, create, update } = makeService([
      row({ targetDate, lastRemindedForTargetDate: targetDate, lastReminderWindow: 7 }),
    ]);

    const summary = await service.evaluateTenant('t1');

    expect(summary).toEqual({ evaluated: 1, reminded: 0, skipped: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('trata los hitos prioritarios (longstop) con antelación mayor y aviso marcado', async () => {
    // A 20 días un hito normal no entraría; el longstop sí (ventana 30).
    const { service, create } = makeService([
      row({ kind: DealMilestoneKind.LONGSTOP, title: 'Longstop', targetDate: relTarget(20) }),
    ]);

    const summary = await service.evaluateTenant('t1');

    expect(summary.reminded).toBe(1);
    expect(create.mock.calls[0][0].data.priority).toBe(true);
    expect(create.mock.calls[0][0].title).toContain('⚠️');
    expect(create.mock.calls[0][0].body).toContain('consecuencias contractuales');
  });

  it('sella el plazo aunque no haya destinatarios, para no reevaluarlo cada día', async () => {
    const { service, create, update } = makeService([
      row({ matter: { reference: 'EXP-1', lawyerId: null, assignments: [] } }),
    ]);

    const summary = await service.evaluateTenant('t1');

    expect(summary.reminded).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
