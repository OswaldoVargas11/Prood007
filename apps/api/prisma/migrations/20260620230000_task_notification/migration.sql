-- LexNET-lite: registro de la notificación procesal de la que nace un plazo.
--   · notificationRef → referencia/acuse de la notificación (p. ej. nº de LexNET).
--   · notifiedAt       → fecha de la notificación (inicio del cómputo del plazo).
-- Nullable: solo aplican a las tareas creadas desde una notificación.
ALTER TABLE "Task" ADD COLUMN "notificationRef" TEXT;
ALTER TABLE "Task" ADD COLUMN "notifiedAt" TIMESTAMP(3);
