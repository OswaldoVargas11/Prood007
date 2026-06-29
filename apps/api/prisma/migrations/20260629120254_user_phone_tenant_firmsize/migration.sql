-- Alta de despacho: dos campos opcionales nuevos.
--   Tenant.firmSize: tamaño declarado del despacho ("1" | "2-5" | "6-20" | "21+"); dimensiona plan/onboarding.
--   User.phone: teléfono de contacto del usuario (recuperación/seguridad; no ventas).
-- Ambos NULLABLE → migración additiva y segura sobre datos existentes.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "firmSize" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
