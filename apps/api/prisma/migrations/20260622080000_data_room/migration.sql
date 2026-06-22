-- Data room de due diligence: set controlado compartido con la contraparte/externos (permisos por
-- carpeta, enlace mágico sin cuenta, log de accesos, marca de agua, Q&A). Tenant-scoped con RLS fail-closed.

CREATE TABLE "DataRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "watermark" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomFolder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRoomFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "sourceVersionId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRoomDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "tokenHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "folderIds" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRoomGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomAccessLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "grantId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRoomAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomQuestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "grantId" TEXT,
    "folderId" TEXT,
    "documentId" TEXT,
    "askedByEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRoomQuestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataRoom_tenantId_idx" ON "DataRoom"("tenantId");
CREATE INDEX "DataRoom_tenantId_matterId_idx" ON "DataRoom"("tenantId", "matterId");
CREATE INDEX "DataRoomFolder_tenantId_idx" ON "DataRoomFolder"("tenantId");
CREATE INDEX "DataRoomFolder_dataRoomId_idx" ON "DataRoomFolder"("dataRoomId");
CREATE INDEX "DataRoomDocument_tenantId_idx" ON "DataRoomDocument"("tenantId");
CREATE INDEX "DataRoomDocument_dataRoomId_idx" ON "DataRoomDocument"("dataRoomId");
CREATE UNIQUE INDEX "DataRoomGrant_tokenHash_key" ON "DataRoomGrant"("tokenHash");
CREATE INDEX "DataRoomGrant_tenantId_idx" ON "DataRoomGrant"("tenantId");
CREATE INDEX "DataRoomGrant_dataRoomId_idx" ON "DataRoomGrant"("dataRoomId");
CREATE INDEX "DataRoomAccessLog_tenantId_idx" ON "DataRoomAccessLog"("tenantId");
CREATE INDEX "DataRoomAccessLog_dataRoomId_createdAt_idx" ON "DataRoomAccessLog"("dataRoomId", "createdAt");
CREATE INDEX "DataRoomQuestion_tenantId_idx" ON "DataRoomQuestion"("tenantId");
CREATE INDEX "DataRoomQuestion_dataRoomId_idx" ON "DataRoomQuestion"("dataRoomId");

ALTER TABLE "DataRoom" ADD CONSTRAINT "DataRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoom" ADD CONSTRAINT "DataRoom_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomFolder" ADD CONSTRAINT "DataRoomFolder_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomFolder" ADD CONSTRAINT "DataRoomFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DataRoomFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomDocument" ADD CONSTRAINT "DataRoomDocument_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomGrant" ADD CONSTRAINT "DataRoomGrant_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomAccessLog" ADD CONSTRAINT "DataRoomAccessLog_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomQuestion" ADD CONSTRAINT "DataRoomQuestion_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant en todas las tablas del data room.
ALTER TABLE "DataRoom" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoom" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoom"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoom" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoom" TO legalflow_system;

ALTER TABLE "DataRoomFolder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomFolder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomFolder"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomFolder" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomFolder" TO legalflow_system;

ALTER TABLE "DataRoomDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomDocument"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomDocument" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomDocument" TO legalflow_system;

ALTER TABLE "DataRoomGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomGrant"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomGrant" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomGrant" TO legalflow_system;

ALTER TABLE "DataRoomAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomAccessLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomAccessLog"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomAccessLog" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomAccessLog" TO legalflow_system;

ALTER TABLE "DataRoomQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomQuestion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomQuestion"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomQuestion" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomQuestion" TO legalflow_system;
