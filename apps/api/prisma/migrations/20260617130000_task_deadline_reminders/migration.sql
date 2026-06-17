-- AlterTable: deduplicación de recordatorios de plazo en Task.
-- lastRemindedForDueDate: fecha límite para la que ya se emitió el último aviso (detecta cambios de dueDate).
-- lastReminderWindow: ventana (días de antelación) más urgente ya notificada para esa fecha límite.
-- Ambas NULLABLE: las tareas existentes nunca han avisado todavía.
ALTER TABLE "Task" ADD COLUMN "lastRemindedForDueDate" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "lastReminderWindow" INTEGER;
