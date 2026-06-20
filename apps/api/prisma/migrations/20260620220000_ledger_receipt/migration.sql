-- Justificante del gasto (suplido): foto del ticket/tasa adjunta al apunte del libro mayor.
-- Clave en el StorageProvider + metadatos. Todo nullable: los apuntes existentes no llevan justificante.
ALTER TABLE "LedgerEntry" ADD COLUMN "receiptKey" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "receiptName" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "receiptMime" TEXT;
