-- Interruptor del canal de correo de los recordatorios de plazos, a dos niveles:
--   · Tenant.deadlineEmailRemindersEnabled  → el despacho lo apaga para todos.
--   · User.deadlineEmailRemindersEnabled     → cada usuario se da de baja de su propio correo.
-- El aviso in-app NO se ve afectado. Default true en ambos: las filas existentes conservan el
-- comportamiento actual (se siguen enviando los correos hasta que alguien lo desactive).
ALTER TABLE "Tenant" ADD COLUMN "deadlineEmailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "deadlineEmailRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;
