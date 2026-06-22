-- Paquetes de plantillas del despacho (ensamblado multi-documento). Tenant-scoped con RLS fail-closed.
CREATE TABLE "DocumentPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPackage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentPackage_tenantId_idx" ON "DocumentPackage"("tenantId");

ALTER TABLE "DocumentPackage" ADD CONSTRAINT "DocumentPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "DocumentPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentPackage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentPackage"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentPackage" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentPackage" TO legalflow_system;
