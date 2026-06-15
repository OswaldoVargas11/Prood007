-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "method" TEXT NOT NULL,
    "providerRef" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS FAIL-CLOSED para la nueva tabla Payment (mismo patrón que las demás tablas de tenant; ver
-- 20260615120000_rls_fail_closed y DECISIONS D-020). Sin contexto de tenant → cero filas y rechazo
-- de INSERT por WITH CHECK. Los GRANT a legalflow_app/legalflow_system los aplica ALTER DEFAULT
-- PRIVILEGES (20260614121000_app_role / 20260615120000_rls_fail_closed) sobre tablas nuevas del owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Payment";
CREATE POLICY tenant_isolation ON "Payment"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
