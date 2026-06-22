-- Bandeja de notificaciones judiciales (LexNET-lite). Tenant-scoped con RLS fail-closed.
CREATE TYPE "JudicialNotificationSource" AS ENUM ('LEXNET', 'IMPORT', 'MANUAL');

CREATE TABLE "JudicialNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT,
    "source" "JudicialNotificationSource" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "court" TEXT,
    "procedureRef" TEXT,
    "type" TEXT,
    "subject" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudicialNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JudicialNotification_tenantId_receivedAt_idx" ON "JudicialNotification"("tenantId", "receivedAt");
CREATE INDEX "JudicialNotification_tenantId_matterId_idx" ON "JudicialNotification"("tenantId", "matterId");
CREATE UNIQUE INDEX "JudicialNotification_tenantId_source_externalId_key" ON "JudicialNotification"("tenantId", "source", "externalId");

ALTER TABLE "JudicialNotification" ADD CONSTRAINT "JudicialNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JudicialNotification" ADD CONSTRAINT "JudicialNotification_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "JudicialNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JudicialNotification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "JudicialNotification"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "JudicialNotification" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "JudicialNotification" TO legalflow_system;
