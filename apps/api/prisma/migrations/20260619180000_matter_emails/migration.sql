-- CreateTable: correspondencia (email) de un expediente, enviada o adjuntada vía Gmail. Tenant-scoped.
CREATE TABLE "MatterEmail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "userId" TEXT,
    "direction" TEXT NOT NULL,
    "gmailId" TEXT,
    "fromAddr" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "subject" TEXT,
    "snippet" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatterEmail_tenantId_matterId_idx" ON "MatterEmail"("tenantId", "matterId");

-- AddForeignKey
ALTER TABLE "MatterEmail" ADD CONSTRAINT "MatterEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterEmail" ADD CONSTRAINT "MatterEmail_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "MatterEmail" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatterEmail" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MatterEmail"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterEmail" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterEmail" TO legalflow_system;
