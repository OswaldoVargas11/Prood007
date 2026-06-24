-- Letrados ADICIONALES asignados a un expediente (el responsable/líder sigue en Matter.lawyerId).
-- Habilita equipos multi-letrado y, en el chat por expediente, restringe la participación a los
-- asignados (líder + estos) + el cliente. Tenant-scoped con RLS fail-closed.

CREATE TABLE "MatterAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatterAssignment_matterId_userId_key" ON "MatterAssignment"("matterId", "userId");
CREATE INDEX "MatterAssignment_tenantId_idx" ON "MatterAssignment"("tenantId");
CREATE INDEX "MatterAssignment_tenantId_matterId_idx" ON "MatterAssignment"("tenantId", "matterId");
CREATE INDEX "MatterAssignment_tenantId_userId_idx" ON "MatterAssignment"("tenantId", "userId");

ALTER TABLE "MatterAssignment" ADD CONSTRAINT "MatterAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterAssignment" ADD CONSTRAINT "MatterAssignment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterAssignment" ADD CONSTRAINT "MatterAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "MatterAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatterAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MatterAssignment"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterAssignment" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterAssignment" TO legalflow_system;
