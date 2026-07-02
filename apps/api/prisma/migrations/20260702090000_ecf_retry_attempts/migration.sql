-- Cierre del ciclo de transmisión e-CF a la DGII (Ley 32-23). Contador de intentos automáticos del
-- cron de reintento/polling + índice para el barrido global de PENDING. Columna aditiva: NO toca
-- dinero, la matemática fiscal ni la inmutabilidad; el cron está además gateado por DGII_ENV.

ALTER TABLE "Invoice" ADD COLUMN "ecfAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Invoice_ecfStatus_idx" ON "Invoice"("ecfStatus");
