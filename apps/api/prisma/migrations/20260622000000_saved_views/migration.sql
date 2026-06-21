-- Vistas guardadas (presets de filtros) privadas por usuario y ámbito. Tenant-scoped con RLS fail-closed.
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_tenantId_userId_scope_idx" ON "SavedView"("tenantId", "userId", "scope");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "SavedView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedView" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SavedView"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "SavedView" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SavedView" TO legalflow_system;
