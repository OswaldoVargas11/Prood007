-- AlterTable: token público de captación (intake) del despacho.
ALTER TABLE "Tenant" ADD COLUMN     "intakeToken" TEXT;

-- CreateTable: prospecto (lead) del mini-CRM, tenant-scoped.
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "subject" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimatedValue" DECIMAL(18,2),
    "assignedToId" TEXT,
    "convertedClientId" TEXT,
    "convertedMatterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_tenantId_status_idx" ON "Lead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lead_tenantId_createdAt_idx" ON "Lead"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_intakeToken_key" ON "Tenant"("intakeToken");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (sin contexto → cero filas). El intake público escribe con el rol
-- legalflow_system (BYPASSRLS), porque no hay contexto de tenant en una petición anónima.
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lead"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "Lead" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Lead" TO legalflow_system;
