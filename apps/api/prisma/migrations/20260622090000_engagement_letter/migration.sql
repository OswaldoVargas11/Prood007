-- Hoja de encargo (carta de compromiso): artefacto de intake con alcance, honorarios y términos,
-- generado y firmado al abrir el expediente. Uno por expediente. Tenant-scoped con RLS fail-closed.

CREATE TABLE "EngagementLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "fees" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "documentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementLetter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EngagementLetter_matterId_key" ON "EngagementLetter"("matterId");
CREATE INDEX "EngagementLetter_tenantId_idx" ON "EngagementLetter"("tenantId");

ALTER TABLE "EngagementLetter" ADD CONSTRAINT "EngagementLetter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EngagementLetter" ADD CONSTRAINT "EngagementLetter_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "EngagementLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EngagementLetter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EngagementLetter"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "EngagementLetter" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EngagementLetter" TO legalflow_system;
