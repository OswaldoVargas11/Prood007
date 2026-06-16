-- CreateEnum
CREATE TYPE "BillingScheduleType" AS ENUM ('RECURRING', 'INSTALLMENTS');

-- CreateEnum
CREATE TYPE "BillingFiscalMode" AS ENUM ('SERVICE_RENDERED', 'ADVANCE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingInstallmentStatus" AS ENUM ('SCHEDULED', 'EMITTED', 'PAID', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "BillingSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "type" "BillingScheduleType" NOT NULL,
    "fiscalMode" "BillingFiscalMode" NOT NULL DEFAULT 'SERVICE_RENDERED',
    "status" "BillingScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "lines" JSONB NOT NULL,
    "withholdingTaxCode" TEXT,
    "intervalUnit" "BillingInterval",
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "occurrences" INTEGER,
    "installmentCount" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInstallment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "BillingInstallmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "invoiceId" TEXT,
    "paymentId" TEXT,
    "emittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingSchedule_tenantId_idx" ON "BillingSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "BillingSchedule_tenantId_matterId_idx" ON "BillingSchedule"("tenantId", "matterId");

-- CreateIndex
CREATE INDEX "BillingSchedule_tenantId_status_nextRunAt_idx" ON "BillingSchedule"("tenantId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "BillingInstallment_tenantId_scheduleId_idx" ON "BillingInstallment"("tenantId", "scheduleId");

-- CreateIndex
CREATE INDEX "BillingInstallment_tenantId_status_dueDate_idx" ON "BillingInstallment"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInstallment_scheduleId_sequence_key" ON "BillingInstallment"("scheduleId", "sequence");

-- AddForeignKey
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSchedule" ADD CONSTRAINT "BillingSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BillingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS FAIL-CLOSED para las nuevas tablas de facturación programada (mismo patrón que retainer/
-- Payment/dunning; ver 20260615120000_rls_fail_closed y DECISIONS D-013/D-020). Sin contexto de
-- tenant → cero filas y rechazo de INSERT por WITH CHECK. Los GRANT a legalflow_app/legalflow_system
-- los aplica ALTER DEFAULT PRIVILEGES sobre tablas nuevas del owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "BillingSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSchedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BillingSchedule";
CREATE POLICY tenant_isolation ON "BillingSchedule"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "BillingInstallment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingInstallment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BillingInstallment";
CREATE POLICY tenant_isolation ON "BillingInstallment"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
