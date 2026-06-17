-- SEC4: lockout por cuenta + obligación de cambio de contraseña.
-- Columnas nuevas en tabla existente: con DEFAULT / NULLABLE (sin backfill).
ALTER TABLE "User" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
