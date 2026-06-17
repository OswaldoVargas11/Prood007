-- CreateTable: solicitud de firma electrónica (Signaturit) sobre una versión de documento.
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'signaturit',
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signUrl" TEXT,
    "detail" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_idx" ON "SignatureRequest"("tenantId");

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_documentId_idx" ON "SignatureRequest"("tenantId", "documentId");

-- CreateIndex
CREATE INDEX "SignatureRequest_tenantId_matterId_idx" ON "SignatureRequest"("tenantId", "matterId");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (sin contexto → cero filas). Igual que el resto de tablas de negocio.
ALTER TABLE "SignatureRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignatureRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SignatureRequest"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "SignatureRequest" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SignatureRequest" TO legalflow_system;
