-- Estado de lectura del chat por (expediente, usuario): última lectura. Habilita recuento de no
-- leídos y acuses «Leído». Tenant-scoped con RLS fail-closed.

CREATE TABLE "MatterReadState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterReadState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatterReadState_matterId_userId_key" ON "MatterReadState"("matterId", "userId");
CREATE INDEX "MatterReadState_tenantId_idx" ON "MatterReadState"("tenantId");
CREATE INDEX "MatterReadState_tenantId_userId_idx" ON "MatterReadState"("tenantId", "userId");

ALTER TABLE "MatterReadState" ADD CONSTRAINT "MatterReadState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterReadState" ADD CONSTRAINT "MatterReadState_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "MatterReadState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatterReadState" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MatterReadState"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterReadState" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterReadState" TO legalflow_system;
