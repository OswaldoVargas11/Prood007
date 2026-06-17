-- CreateTable: plantilla de documento del despacho (tenant-scoped).
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentTemplate_tenantId_idx" ON "DocumentTemplate"("tenantId");

ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (igual que el resto de tablas de negocio; sin contexto → cero filas).
ALTER TABLE "DocumentTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentTemplate"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

-- Privilegios DML para los roles de aplicación (las default privileges ya lo cubrirían; explícito).
GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentTemplate" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DocumentTemplate" TO legalflow_system;
