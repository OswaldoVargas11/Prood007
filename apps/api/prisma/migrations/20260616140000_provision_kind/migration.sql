-- CreateEnum
CREATE TYPE "ProvisionKind" AS ENUM ('ANTICIPO', 'SUPLIDO', 'GENERICO');

-- AlterTable: naturaleza fiscal del depósito de provisión (solo en DEPOSIT; null en el resto).
ALTER TABLE "RetainerEntry" ADD COLUMN "kind" "ProvisionKind";
