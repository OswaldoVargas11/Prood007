import { DealMilestoneKind } from '@legalflow/domain';
import {
  DEFAULT_MILESTONE_WINDOWS,
  PRIORITY_MILESTONE_WINDOWS,
  WIDEST_MILESTONE_WINDOW,
  daysUntil,
  isPriorityMilestoneKind,
  milestoneReminderWindow,
  shouldRemind,
  windowsForMilestoneKind,
} from './milestone-reminders.logic';

/**
 * Lógica PURA del avisador de plazos de hitos (T-3): selección de ventana (incl. límites) y la decisión
 * de idempotencia. Cubre el criterio de aceptación "detección de plazos próximos/vencidos testeada
 * (límites de ventana)". Sin BD.
 */

/** Medianoche UTC fija para que el test sea determinista (no depende del reloj). */
const TODAY = new Date('2026-07-01T00:00:00.000Z');
/** Fecha objetivo a `n` días naturales de TODAY (negativo = en el pasado). */
function targetInDays(n: number): Date {
  return new Date(TODAY.getTime() + n * 86_400_000);
}

describe('milestone-reminders logic', () => {
  describe('clasificación de tipos prioritarios', () => {
    it('LONGSTOP y CONDITIONS_DEADLINE son prioritarios; el resto no', () => {
      expect(isPriorityMilestoneKind(DealMilestoneKind.LONGSTOP)).toBe(true);
      expect(isPriorityMilestoneKind(DealMilestoneKind.CONDITIONS_DEADLINE)).toBe(true);
      expect(isPriorityMilestoneKind(DealMilestoneKind.SIGNING)).toBe(false);
      expect(isPriorityMilestoneKind(DealMilestoneKind.CLOSING)).toBe(false);
      expect(isPriorityMilestoneKind(DealMilestoneKind.CUSTOM)).toBe(false);
    });

    it('los prioritarios usan ventanas más amplias que el resto', () => {
      expect(windowsForMilestoneKind(DealMilestoneKind.CUSTOM)).toEqual(DEFAULT_MILESTONE_WINDOWS);
      expect(windowsForMilestoneKind(DealMilestoneKind.LONGSTOP)).toEqual(PRIORITY_MILESTONE_WINDOWS);
      expect(WIDEST_MILESTONE_WINDOW).toBe(Math.max(...PRIORITY_MILESTONE_WINDOWS));
      expect(WIDEST_MILESTONE_WINDOW).toBe(30);
    });
  });

  describe('daysUntil', () => {
    it('cuenta días naturales y es negativo en el pasado', () => {
      expect(daysUntil(targetInDays(0), TODAY)).toBe(0);
      expect(daysUntil(targetInDays(5), TODAY)).toBe(5);
      expect(daysUntil(targetInDays(-3), TODAY)).toBe(-3);
    });
  });

  describe('milestoneReminderWindow — límites de ventana (tipo normal: [1,7,14])', () => {
    const normal = DealMilestoneKind.CUSTOM;

    it('elige la ventana MÁS URGENTE cuyo umbral ya se alcanzó', () => {
      expect(milestoneReminderWindow(targetInDays(14), normal, TODAY)).toBe(14);
      expect(milestoneReminderWindow(targetInDays(10), normal, TODAY)).toBe(14);
      expect(milestoneReminderWindow(targetInDays(8), normal, TODAY)).toBe(14);
      expect(milestoneReminderWindow(targetInDays(7), normal, TODAY)).toBe(7); // límite exacto
      expect(milestoneReminderWindow(targetInDays(5), normal, TODAY)).toBe(7);
      expect(milestoneReminderWindow(targetInDays(1), normal, TODAY)).toBe(1); // límite exacto
      expect(milestoneReminderWindow(targetInDays(0), normal, TODAY)).toBe(1); // vence hoy
    });

    it('los hitos YA vencidos caen en la ventana más urgente', () => {
      expect(milestoneReminderWindow(targetInDays(-1), normal, TODAY)).toBe(1);
      expect(milestoneReminderWindow(targetInDays(-30), normal, TODAY)).toBe(1);
    });

    it('null cuando la fecha está fuera de la ventana más amplia', () => {
      expect(milestoneReminderWindow(targetInDays(15), normal, TODAY)).toBeNull();
      expect(milestoneReminderWindow(targetInDays(60), normal, TODAY)).toBeNull();
    });
  });

  describe('milestoneReminderWindow — tipo prioritario ([1,3,7,14,30])', () => {
    const prio = DealMilestoneKind.LONGSTOP;

    it('avisa con más antelación que un hito normal (hasta T-30)', () => {
      // A 20 días un hito normal no entra; el longstop sí (ventana 30).
      expect(milestoneReminderWindow(targetInDays(20), DealMilestoneKind.CUSTOM, TODAY)).toBeNull();
      expect(milestoneReminderWindow(targetInDays(20), prio, TODAY)).toBe(30);
      expect(milestoneReminderWindow(targetInDays(30), prio, TODAY)).toBe(30); // límite exacto
      expect(milestoneReminderWindow(targetInDays(3), prio, TODAY)).toBe(3); // ventana intermedia extra
      expect(milestoneReminderWindow(targetInDays(31), prio, TODAY)).toBeNull();
    });
  });

  describe('shouldRemind — idempotencia y escalado de ventana', () => {
    const targetDate = targetInDays(7);

    it('avisa la primera vez (sin sello previo)', () => {
      expect(
        shouldRemind({
          window: 14,
          targetDate,
          lastRemindedForTargetDate: null,
          lastReminderWindow: null,
        }),
      ).toBe(true);
    });

    it('NO repite la misma ventana ya avisada del mismo plazo', () => {
      expect(
        shouldRemind({
          window: 14,
          targetDate,
          lastRemindedForTargetDate: targetDate,
          lastReminderWindow: 14,
        }),
      ).toBe(false);
    });

    it('NO repite una ventana más holgada que la última avisada', () => {
      // Ya avisamos la ventana 7 (más urgente); una reevaluación que cae en 14 no debe reavisar.
      expect(
        shouldRemind({
          window: 14,
          targetDate,
          lastRemindedForTargetDate: targetDate,
          lastReminderWindow: 7,
        }),
      ).toBe(false);
    });

    it('SÍ reavisa al entrar una ventana más urgente del mismo plazo', () => {
      expect(
        shouldRemind({
          window: 7,
          targetDate,
          lastRemindedForTargetDate: targetDate,
          lastReminderWindow: 14,
        }),
      ).toBe(true);
    });

    it('SÍ reavisa si la fecha objetivo cambió (se reprogramó el hito)', () => {
      expect(
        shouldRemind({
          window: 14,
          targetDate,
          lastRemindedForTargetDate: targetInDays(20), // otra fecha
          lastReminderWindow: 14,
        }),
      ).toBe(true);
    });
  });
});
