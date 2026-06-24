-- Rangos de eNCF autorizados por la DGII (RD) por despacho y tipo de comprobante. El emisor e-CF debe
-- numerar desde un rango AUTORIZADO, no desde la serie interna (cierra el hueco D8-005 para RD).
CREATE TABLE "EcfSequence" (
    "tenantId" TEXT NOT NULL,
    "ncfType" TEXT NOT NULL,
    "rangeStart" INTEGER NOT NULL,
    "rangeEnd" INTEGER NOT NULL,
    "next" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcfSequence_pkey" PRIMARY KEY ("tenantId", "ncfType")
);
CREATE INDEX "EcfSequence_tenantId_idx" ON "EcfSequence"("tenantId");

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "EcfSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EcfSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EcfSequence"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "EcfSequence" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EcfSequence" TO legalflow_system;
