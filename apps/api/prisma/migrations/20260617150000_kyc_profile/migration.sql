-- CreateTable: perfil KYC/AML del cliente (1:1 con Client, tenant-scoped).
CREATE TABLE "KycProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "risk" TEXT NOT NULL DEFAULT 'MEDIUM',
    "isPep" BOOLEAN NOT NULL DEFAULT false,
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "sanctionsChecked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KycProfile_clientId_key" ON "KycProfile"("clientId");
CREATE INDEX "KycProfile_tenantId_idx" ON "KycProfile"("tenantId");

ALTER TABLE "KycProfile" ADD CONSTRAINT "KycProfile_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KycProfile" ADD CONSTRAINT "KycProfile_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant (sin contexto → cero filas).
ALTER TABLE "KycProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KycProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KycProfile"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "KycProfile" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "KycProfile" TO legalflow_system;
