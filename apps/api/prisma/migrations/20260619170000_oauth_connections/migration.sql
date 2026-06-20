-- CreateTable: conexión OAuth de un usuario con un proveedor externo (Google Calendar + Gmail).
-- Tokens cifrados en reposo (AES-256-GCM con DATA_ENCRYPTION_KEY). Tenant-scoped.
CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEmail" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OAuthConnection_tenantId_idx" ON "OAuthConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthConnection_userId_provider_key" ON "OAuthConnection"("userId", "provider");

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (sin contexto → cero filas). El callback OAuth escribe con el rol
-- legalflow_system (BYPASSRLS), porque el redirect de Google llega sin contexto de tenant.
ALTER TABLE "OAuthConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OAuthConnection"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "OAuthConnection" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OAuthConnection" TO legalflow_system;
