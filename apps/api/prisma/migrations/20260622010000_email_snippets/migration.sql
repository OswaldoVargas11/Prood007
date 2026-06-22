-- Plantillas/snippets de correo del despacho (respuestas recurrentes). Tenant-scoped con RLS fail-closed.
CREATE TABLE "EmailSnippet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSnippet_tenantId_idx" ON "EmailSnippet"("tenantId");

-- AddForeignKey
ALTER TABLE "EmailSnippet" ADD CONSTRAINT "EmailSnippet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "EmailSnippet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailSnippet" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmailSnippet"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailSnippet" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailSnippet" TO legalflow_system;
