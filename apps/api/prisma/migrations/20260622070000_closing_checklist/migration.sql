-- Checklist de cierre transaccional (condiciones previas, entregables, hojas de firma) +
-- generación del closing binder. Tenant-scoped con RLS fail-closed.
CREATE TYPE "ClosingItemCategory" AS ENUM ('CONDITION_PRECEDENT', 'DELIVERABLE', 'SIGNATURE_PAGE', 'OTHER');
CREATE TYPE "ClosingItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'WAIVED', 'SATISFIED');

CREATE TABLE "ClosingChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "closingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosingChecklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingChecklist_tenantId_idx" ON "ClosingChecklist"("tenantId");
CREATE INDEX "ClosingChecklist_tenantId_matterId_idx" ON "ClosingChecklist"("tenantId", "matterId");

CREATE TABLE "ClosingChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "category" "ClosingItemCategory" NOT NULL DEFAULT 'DELIVERABLE',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "ClosingItemStatus" NOT NULL DEFAULT 'PENDING',
    "responsibleParty" TEXT,
    "assigneeId" TEXT,
    "documentId" TEXT,
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosingChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosingChecklistItem_tenantId_idx" ON "ClosingChecklistItem"("tenantId");
CREATE INDEX "ClosingChecklistItem_checklistId_idx" ON "ClosingChecklistItem"("checklistId");

ALTER TABLE "ClosingChecklist" ADD CONSTRAINT "ClosingChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClosingChecklist" ADD CONSTRAINT "ClosingChecklist_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClosingChecklistItem" ADD CONSTRAINT "ClosingChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClosingChecklistItem" ADD CONSTRAINT "ClosingChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ClosingChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "ClosingChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClosingChecklist" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClosingChecklist"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClosingChecklist" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClosingChecklist" TO legalflow_system;

ALTER TABLE "ClosingChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClosingChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ClosingChecklistItem"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClosingChecklistItem" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ClosingChecklistItem" TO legalflow_system;
