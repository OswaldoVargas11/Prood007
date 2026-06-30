-- Alertas de plazo del calendario de operación (T-3 profundidad transaccional).
-- Añade idempotencia al avisador in-app de hitos: la última fecha objetivo y ventana ya avisadas, para
-- no duplicar el recordatorio del mismo plazo y reavisar al estrechar la ventana o al mover la fecha.
-- Mismo patrón que Task.lastRemindedForDueDate / lastReminderWindow. Sin RLS adicional: columnas en una
-- tabla ya protegida (DealMilestone). NO toca dinero, fiscal ni canal externo.

ALTER TABLE "DealMilestone" ADD COLUMN "lastRemindedForTargetDate" TIMESTAMP(3);
ALTER TABLE "DealMilestone" ADD COLUMN "lastReminderWindow" INTEGER;
