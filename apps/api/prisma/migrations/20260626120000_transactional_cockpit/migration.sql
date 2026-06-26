-- Cockpit transaccional: cierra los huecos operativos de una operación (M&A/inmobiliario/financiación).
--  · Checklist de cierre: fase signing/closing/post-closing + hojas de firma en depósito (escrow).
--  · Calendario de la operación: hitos en días naturales (longstop/drop-dead, funds flow…) ≠ plazos procesales.
--  · Working group list: partes de la operación con sus asesores y listas de distribución.
--  · Disclosure schedules: anexos de manifestaciones que matizan las reps & warranties.
--  · Registros por jurisdicción: tipado del registro (RM/RP/Registro de Títulos RD/Cámara RD…) + presentaciones.
--  · Data room: grupos de permisos (los grants heredan carpetas/descarga del grupo).
-- Todo tenant-scoped con RLS fail-closed.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "ClosingItemPhase" AS ENUM ('AT_SIGNING', 'AT_CLOSING', 'POST_CLOSING');
CREATE TYPE "DealPartySide" AS ENUM ('BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER');
CREATE TYPE "DealPartyRole" AS ENUM ('PRINCIPAL', 'LEGAL_COUNSEL', 'FINANCIAL_ADVISOR', 'NOTARY', 'OTHER');
CREATE TYPE "DealMilestoneKind" AS ENUM ('SIGNING', 'CLOSING', 'LONGSTOP', 'CONDITIONS_DEADLINE', 'FUNDS_FLOW', 'FILING', 'CUSTOM');
CREATE TYPE "DealMilestoneStatus" AS ENUM ('PENDING', 'DONE', 'MISSED');
CREATE TYPE "RegistryKind" AS ENUM ('REGISTRO_MERCANTIL', 'REGISTRO_PROPIEDAD', 'INDICE_UNICO_NOTARIAL', 'NOTARIA', 'REGISTRO_TITULOS_RD', 'CAMARA_COMERCIO_RD', 'OTHER');
CREATE TYPE "RegistryFilingStatus" AS ENUM ('PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED');
CREATE TYPE "DisclosureScheduleStatus" AS ENUM ('DRAFT', 'AGREED');

-- ── Alters ───────────────────────────────────────────────────────────────────
ALTER TABLE "ClosingChecklist" ADD COLUMN "signingDate" TIMESTAMP(3);
ALTER TABLE "ClosingChecklist" ADD COLUMN "longstopDate" TIMESTAMP(3);

ALTER TABLE "ClosingChecklistItem" ADD COLUMN "phase" "ClosingItemPhase" NOT NULL DEFAULT 'AT_CLOSING';
ALTER TABLE "ClosingChecklistItem" ADD COLUMN "inEscrow" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClosingChecklistItem" ADD COLUMN "releasedAt" TIMESTAMP(3);

ALTER TABLE "RegistryObligation" ADD COLUMN "registry" "RegistryKind" NOT NULL DEFAULT 'REGISTRO_MERCANTIL';
ALTER TABLE "RegistryObligation" ADD COLUMN "referenceCode" TEXT;

ALTER TABLE "DataRoomGrant" ADD COLUMN "groupId" TEXT;

-- ── Tablas nuevas ────────────────────────────────────────────────────────────
CREATE TABLE "DealParty" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "side" "DealPartySide" NOT NULL DEFAULT 'OTHER',
    "role" "DealPartyRole" NOT NULL DEFAULT 'PRINCIPAL',
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isDistribution" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealParty_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DealMilestone" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "kind" "DealMilestoneKind" NOT NULL DEFAULT 'CUSTOM',
    "title" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "status" "DealMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisclosureSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "repWarranty" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "documentId" TEXT,
    "status" "DisclosureScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisclosureSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistryFiling" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "registry" "RegistryKind" NOT NULL DEFAULT 'REGISTRO_MERCANTIL',
    "title" TEXT NOT NULL,
    "referenceCode" TEXT,
    "status" "RegistryFilingStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryFiling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataRoomGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataRoomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folderIds" TEXT[],
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataRoomGroup_pkey" PRIMARY KEY ("id")
);

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX "DealParty_tenantId_idx" ON "DealParty"("tenantId");
CREATE INDEX "DealParty_tenantId_matterId_idx" ON "DealParty"("tenantId", "matterId");
CREATE INDEX "DealMilestone_tenantId_idx" ON "DealMilestone"("tenantId");
CREATE INDEX "DealMilestone_tenantId_matterId_idx" ON "DealMilestone"("tenantId", "matterId");
CREATE INDEX "DealMilestone_tenantId_targetDate_idx" ON "DealMilestone"("tenantId", "targetDate");
CREATE INDEX "DisclosureSchedule_tenantId_idx" ON "DisclosureSchedule"("tenantId");
CREATE INDEX "DisclosureSchedule_tenantId_matterId_idx" ON "DisclosureSchedule"("tenantId", "matterId");
CREATE INDEX "RegistryFiling_tenantId_idx" ON "RegistryFiling"("tenantId");
CREATE INDEX "RegistryFiling_tenantId_matterId_idx" ON "RegistryFiling"("tenantId", "matterId");
CREATE INDEX "DataRoomGroup_tenantId_idx" ON "DataRoomGroup"("tenantId");
CREATE INDEX "DataRoomGroup_dataRoomId_idx" ON "DataRoomGroup"("dataRoomId");

-- ── Claves foráneas ──────────────────────────────────────────────────────────
ALTER TABLE "DealParty" ADD CONSTRAINT "DealParty_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealParty" ADD CONSTRAINT "DealParty_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealMilestone" ADD CONSTRAINT "DealMilestone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealMilestone" ADD CONSTRAINT "DealMilestone_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisclosureSchedule" ADD CONSTRAINT "DisclosureSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisclosureSchedule" ADD CONSTRAINT "DisclosureSchedule_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryFiling" ADD CONSTRAINT "RegistryFiling_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RegistryFiling" ADD CONSTRAINT "RegistryFiling_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomGroup" ADD CONSTRAINT "DataRoomGroup_dataRoomId_fkey" FOREIGN KEY ("dataRoomId") REFERENCES "DataRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataRoomGrant" ADD CONSTRAINT "DataRoomGrant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DataRoomGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ───────────────────────────────────────────────
ALTER TABLE "DealParty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealParty" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DealParty"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealParty" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealParty" TO legalflow_system;

ALTER TABLE "DealMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealMilestone" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DealMilestone"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealMilestone" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealMilestone" TO legalflow_system;

ALTER TABLE "DisclosureSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisclosureSchedule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DisclosureSchedule"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DisclosureSchedule" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DisclosureSchedule" TO legalflow_system;

ALTER TABLE "RegistryFiling" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegistryFiling" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RegistryFiling"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "RegistryFiling" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RegistryFiling" TO legalflow_system;

ALTER TABLE "DataRoomGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRoomGroup" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DataRoomGroup"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomGroup" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DataRoomGroup" TO legalflow_system;
