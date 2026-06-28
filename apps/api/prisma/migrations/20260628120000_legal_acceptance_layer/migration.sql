-- ─────────────────────────────────────────────────────────────────────────────
-- Capa de aceptación legal (clickwrap reforzado, sin proveedor de firma) — 2026-06-28
--
-- LegalDocument  : catálogo GLOBAL de textos legales versionados (ToS, Privacidad, DPA, subprocesadores,
--                  renuncia al desistimiento). No es dato de tenant → sin RLS, como Permission. El rol de
--                  app solo LEE (SELECT); la publicación de versiones la hace el rol de sistema.
-- LegalAcceptance: registro PROBATORIO por tenant, APPEND-ONLY (rol de app: solo SELECT+INSERT, nunca
--                  UPDATE/DELETE), con RLS fail-closed por tenant. Patrón idéntico a FiscalEvent/AuditLog.
-- Tenant.accountType: perfil que dirige el conjunto de documentos a aceptar, el trato fiscal y si aplica DPA.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('FIRM', 'PROFESSIONAL', 'CONSUMER');
CREATE TYPE "LegalDocType" AS ENUM ('TERMS', 'TERMS_CONSUMER', 'PRIVACY', 'DPA', 'SUBPROCESSORS', 'WITHDRAWAL_WAIVER');
CREATE TYPE "AcceptanceMethod" AS ENUM ('CLICKWRAP', 'TYPED', 'UPLOADED');
CREATE TYPE "AcceptanceAct" AS ENUM ('ENROLLMENT', 'RE_ACCEPTANCE', 'WITHDRAWAL_WAIVER');

-- AlterTable: perfil de la cuenta (los despachos existentes quedan como FIRM).
ALTER TABLE "Tenant" ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'FIRM';

-- CreateTable: catálogo global de documentos legales versionados.
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocType" NOT NULL,
    "jurisdiction" "Jurisdiction",
    "locale" TEXT NOT NULL DEFAULT 'es',
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "sourceRef" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegalDocument_type_isCurrent_idx" ON "LegalDocument"("type", "isCurrent");
CREATE UNIQUE INDEX "LegalDocument_type_jurisdiction_locale_version_key" ON "LegalDocument"("type", "jurisdiction", "locale", "version");

-- CreateTable: registro probatorio de aceptación (clickwrap reforzado).
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalDocumentId" TEXT NOT NULL,
    "documentType" "LegalDocType" NOT NULL,
    "version" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "method" "AcceptanceMethod" NOT NULL,
    "act" "AcceptanceAct" NOT NULL DEFAULT 'ENROLLMENT',
    "shownSnapshot" JSONB,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "signerName" TEXT,
    "signerRole" TEXT,
    "evidenceDocId" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LegalAcceptance_tenantId_documentType_version_idx" ON "LegalAcceptance"("tenantId", "documentType", "version");
CREATE INDEX "LegalAcceptance_tenantId_userId_idx" ON "LegalAcceptance"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_legalDocumentId_fkey" FOREIGN KEY ("legalDocumentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── LegalDocument: catálogo GLOBAL (sin RLS). El rol de app solo lee; el de sistema publica versiones. ──
GRANT SELECT ON "LegalDocument" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LegalDocument" TO legalflow_system;

-- ── LegalAcceptance: RLS FAIL-CLOSED por tenant + APPEND-ONLY para el rol de app. ──
ALTER TABLE "LegalAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegalAcceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LegalAcceptance"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
-- Solo SELECT + INSERT para la app (no puede reescribir ni borrar su propio rastro de aceptación). El rol de
-- sistema conserva todo para el borrado en cascada del tenant. El REVOKE es defensivo ante privilegios por defecto.
GRANT SELECT, INSERT ON "LegalAcceptance" TO legalflow_app;
REVOKE UPDATE, DELETE ON "LegalAcceptance" FROM legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LegalAcceptance" TO legalflow_system;
