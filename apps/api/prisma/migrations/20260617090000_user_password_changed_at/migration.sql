-- AlterTable: sello del último cambio de contraseña (auditoría + base para invalidación de tokens).
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
