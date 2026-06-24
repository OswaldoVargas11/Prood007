-- Checklists de presentación por tipo de gestión (catálogo editable por despacho) + instancia por
-- expediente. Tenant-scoped con RLS fail-closed.

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'UPLOADED', 'NA');

-- CreateTable: PresentationType (tipo de presentación del catálogo del despacho)
CREATE TABLE "PresentationType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction",
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationType_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PresentationType_tenantId_idx" ON "PresentationType"("tenantId");
CREATE INDEX "PresentationType_tenantId_sector_idx" ON "PresentationType"("tenantId", "sector");
ALTER TABLE "PresentationType" ADD CONSTRAINT "PresentationType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PresentationRequirement (documento requerido dentro de un tipo)
CREATE TABLE "PresentationRequirement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "presentationTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PresentationRequirement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PresentationRequirement_tenantId_idx" ON "PresentationRequirement"("tenantId");
CREATE INDEX "PresentationRequirement_presentationTypeId_idx" ON "PresentationRequirement"("presentationTypeId");
ALTER TABLE "PresentationRequirement" ADD CONSTRAINT "PresentationRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationRequirement" ADD CONSTRAINT "PresentationRequirement_presentationTypeId_fkey" FOREIGN KEY ("presentationTypeId") REFERENCES "PresentationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: MatterChecklist (instancia aplicada a un expediente)
CREATE TABLE "MatterChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "presentationTypeId" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterChecklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatterChecklist_tenantId_idx" ON "MatterChecklist"("tenantId");
CREATE INDEX "MatterChecklist_tenantId_matterId_idx" ON "MatterChecklist"("tenantId", "matterId");
ALTER TABLE "MatterChecklist" ADD CONSTRAINT "MatterChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterChecklist" ADD CONSTRAINT "MatterChecklist_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterChecklist" ADD CONSTRAINT "MatterChecklist_presentationTypeId_fkey" FOREIGN KEY ("presentationTypeId") REFERENCES "PresentationType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: MatterChecklistItem (requisito instanciado con estado y documento aportado)
CREATE TABLE "MatterChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "requirementId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "documentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MatterChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatterChecklistItem_tenantId_idx" ON "MatterChecklistItem"("tenantId");
CREATE INDEX "MatterChecklistItem_checklistId_idx" ON "MatterChecklistItem"("checklistId");
ALTER TABLE "MatterChecklistItem" ADD CONSTRAINT "MatterChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterChecklistItem" ADD CONSTRAINT "MatterChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "MatterChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (las cuatro tablas).
ALTER TABLE "PresentationType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PresentationType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PresentationType"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationType" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationType" TO legalflow_system;

ALTER TABLE "PresentationRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PresentationRequirement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PresentationRequirement"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationRequirement" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationRequirement" TO legalflow_system;

ALTER TABLE "MatterChecklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatterChecklist" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MatterChecklist"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterChecklist" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterChecklist" TO legalflow_system;

ALTER TABLE "MatterChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MatterChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MatterChecklistItem"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterChecklistItem" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MatterChecklistItem" TO legalflow_system;
