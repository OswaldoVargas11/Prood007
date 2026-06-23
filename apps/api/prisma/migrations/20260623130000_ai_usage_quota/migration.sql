-- Cuota diaria de IA por tenant (control de coste contra la clave compartida del proveedor).
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsage_tenantId_day_key" ON "AiUsage"("tenantId", "day");
CREATE INDEX "AiUsage_tenantId_idx" ON "AiUsage"("tenantId");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "AiUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiUsage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiUsage"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiUsage" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiUsage" TO legalflow_system;
