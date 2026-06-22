-- Biblioteca de cláusulas reutilizables del despacho (ensamblado de plantillas). RLS fail-closed.
CREATE TABLE "Clause" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clause_tenantId_idx" ON "Clause"("tenantId");

-- AddForeignKey
ALTER TABLE "Clause" ADD CONSTRAINT "Clause_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "Clause" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clause" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Clause"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "Clause" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Clause" TO legalflow_system;
