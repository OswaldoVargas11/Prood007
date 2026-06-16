-- CreateEnum
CREATE TYPE "RetainerMovementType" AS ENUM ('DEPOSIT', 'APPLICATION', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "RetainerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetainerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "RetainerMovementType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetainerAccount_clientId_key" ON "RetainerAccount"("clientId");

-- CreateIndex
CREATE INDEX "RetainerAccount_tenantId_idx" ON "RetainerAccount"("tenantId");

-- CreateIndex
CREATE INDEX "RetainerEntry_tenantId_accountId_idx" ON "RetainerEntry"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "RetainerEntry_tenantId_createdAt_idx" ON "RetainerEntry"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "RetainerAccount" ADD CONSTRAINT "RetainerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerAccount" ADD CONSTRAINT "RetainerAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerEntry" ADD CONSTRAINT "RetainerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerEntry" ADD CONSTRAINT "RetainerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "RetainerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerEntry" ADD CONSTRAINT "RetainerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerEntry" ADD CONSTRAINT "RetainerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS FAIL-CLOSED para las nuevas tablas de retainer (mismo patrón que Payment/dunning; ver
-- 20260615120000_rls_fail_closed y DECISIONS D-013/D-020). Sin contexto de tenant → cero filas y
-- rechazo de INSERT por WITH CHECK. Los GRANT a legalflow_app/legalflow_system los aplica ALTER
-- DEFAULT PRIVILEGES sobre tablas nuevas del owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "RetainerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetainerAccount" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RetainerAccount";
CREATE POLICY tenant_isolation ON "RetainerAccount"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "RetainerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RetainerEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RetainerEntry";
CREATE POLICY tenant_isolation ON "RetainerEntry"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
