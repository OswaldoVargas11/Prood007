-- Idempotencia del webhook de cobros acotada por tenant: el índice único de `providerRef` pasa de
-- GLOBAL a (tenantId, providerRef), coherente con el dedup de aplicación. Las refs de Stripe son
-- globalmente únicas, así que no hay colisión al migrar.
DROP INDEX IF EXISTS "Payment_providerRef_key";
CREATE UNIQUE INDEX "Payment_tenantId_providerRef_key" ON "Payment"("tenantId", "providerRef");
