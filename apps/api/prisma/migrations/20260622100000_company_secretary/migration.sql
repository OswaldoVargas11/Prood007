-- Secretaría de sociedades (sub-perfil mercantil): libro de actas, libro de socios y obligaciones
-- recurrentes al Registro. Por sociedad (= Client). Tenant-scoped con RLS fail-closed.

CREATE TABLE "CorporateMinute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL_MEETING',
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateMinute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shareholder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "units" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShareTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromName" TEXT,
    "toName" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistryObligation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'ANNUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryObligation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorporateMinute_tenantId_idx" ON "CorporateMinute"("tenantId");
CREATE INDEX "CorporateMinute_tenantId_clientId_idx" ON "CorporateMinute"("tenantId", "clientId");
CREATE INDEX "Shareholder_tenantId_idx" ON "Shareholder"("tenantId");
CREATE INDEX "Shareholder_tenantId_clientId_idx" ON "Shareholder"("tenantId", "clientId");
CREATE INDEX "ShareTransfer_tenantId_idx" ON "ShareTransfer"("tenantId");
CREATE INDEX "ShareTransfer_tenantId_clientId_idx" ON "ShareTransfer"("tenantId", "clientId");
CREATE INDEX "RegistryObligation_tenantId_idx" ON "RegistryObligation"("tenantId");
CREATE INDEX "RegistryObligation_tenantId_clientId_idx" ON "RegistryObligation"("tenantId", "clientId");
CREATE INDEX "RegistryObligation_tenantId_dueDate_idx" ON "RegistryObligation"("tenantId", "dueDate");

ALTER TABLE "CorporateMinute" ADD CONSTRAINT "CorporateMinute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateMinute" ADD CONSTRAINT "CorporateMinute_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shareholder" ADD CONSTRAINT "Shareholder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shareholder" ADD CONSTRAINT "Shareholder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryObligation" ADD CONSTRAINT "RegistryObligation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryObligation" ADD CONSTRAINT "RegistryObligation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "CorporateMinute" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CorporateMinute" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CorporateMinute"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "CorporateMinute" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CorporateMinute" TO legalflow_system;

ALTER TABLE "Shareholder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shareholder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Shareholder"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Shareholder" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Shareholder" TO legalflow_system;

ALTER TABLE "ShareTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShareTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ShareTransfer"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ShareTransfer" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ShareTransfer" TO legalflow_system;

ALTER TABLE "RegistryObligation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistryObligation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistryObligation"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "RegistryObligation" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RegistryObligation" TO legalflow_system;
