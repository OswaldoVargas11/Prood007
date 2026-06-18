-- AlterTable: campos de suscripción de PLATAFORMA (SaaS, modelo POR USUARIO) en Tenant.
-- Prueba de 15 días (TRIALING) → al expirar sin suscripción, muro (SubscriptionGuard).
-- `seats` = plazas de staff contratadas (0 = en prueba). Precio por plaza con descuento por volumen.
ALTER TABLE "Tenant" ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "seats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIALING',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- Despachos EXISTENTES (anteriores al sistema de suscripción): grandfathering a ACTIVE, con `seats`
-- = plazas actuales de su licencia (admins + letrados). En una BD nueva (CI) la tabla está vacía.
UPDATE "Tenant" SET "subscriptionStatus" = 'ACTIVE', "seats" = "maxAdmins" + "maxLawyers";
