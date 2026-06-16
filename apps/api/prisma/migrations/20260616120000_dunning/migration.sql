-- CreateEnum
CREATE TYPE "DunningChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "DunningSeverity" AS ENUM ('REMINDER', 'WARNING', 'FINAL');

-- CreateEnum
CREATE TYPE "DunningReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "DunningRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "severity" "DunningSeverity" NOT NULL DEFAULT 'REMINDER',
    "channel" "DunningChannel" NOT NULL DEFAULT 'IN_APP',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DunningReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ruleId" TEXT,
    "offsetDays" INTEGER NOT NULL,
    "severity" "DunningSeverity" NOT NULL,
    "channel" "DunningChannel" NOT NULL DEFAULT 'IN_APP',
    "status" "DunningReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DunningRule_tenantId_idx" ON "DunningRule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DunningRule_tenantId_offsetDays_key" ON "DunningRule"("tenantId", "offsetDays");

-- CreateIndex
CREATE INDEX "DunningReminder_tenantId_invoiceId_idx" ON "DunningReminder"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "DunningReminder_tenantId_status_idx" ON "DunningReminder"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DunningReminder_tenantId_invoiceId_offsetDays_key" ON "DunningReminder"("tenantId", "invoiceId", "offsetDays");

-- AddForeignKey
ALTER TABLE "DunningRule" ADD CONSTRAINT "DunningRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningReminder" ADD CONSTRAINT "DunningReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningReminder" ADD CONSTRAINT "DunningReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningReminder" ADD CONSTRAINT "DunningReminder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "DunningRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS FAIL-CLOSED para las nuevas tablas de dunning (mismo patrón que Payment y demás tablas de
-- tenant; ver 20260615120000_rls_fail_closed, 20260615200036_payments y DECISIONS D-013/D-020). Sin
-- contexto de tenant → cero filas y rechazo de INSERT por WITH CHECK. Los GRANT a
-- legalflow_app/legalflow_system los aplica ALTER DEFAULT PRIVILEGES sobre tablas nuevas del owner.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "DunningRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DunningRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DunningRule";
CREATE POLICY tenant_isolation ON "DunningRule"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "DunningReminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DunningReminder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DunningReminder";
CREATE POLICY tenant_isolation ON "DunningReminder"
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
