-- Sistema de ficheros (carpetas anidadas) reutilizable: documentos de un expediente (kind=DOCUMENT,
-- matterId presente) y plantillas del despacho (kind=TEMPLATE, matterId nulo). Árbol vía auto-relación.
-- Tenant-scoped con RLS fail-closed.

-- CreateEnum
CREATE TYPE "FolderKind" AS ENUM ('DOCUMENT', 'TEMPLATE');

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "FolderKind" NOT NULL,
    "matterId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Folder_tenantId_idx" ON "Folder"("tenantId");
CREATE INDEX "Folder_tenantId_kind_matterId_idx" ON "Folder"("tenantId", "kind", "matterId");
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn: enlace de Document y DocumentTemplate a su carpeta (null = raíz).
ALTER TABLE "Document" ADD COLUMN "folderId" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "folderId" TEXT;
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");
CREATE INDEX "DocumentTemplate_folderId_idx" ON "DocumentTemplate"("folderId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Folder"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Folder" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Folder" TO legalflow_system;
