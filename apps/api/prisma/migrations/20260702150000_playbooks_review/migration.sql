-- Playbooks de revisión de contratos (estilo Spellbook/Ironclad): Playbook + PlaybookRule (posiciones
-- del despacho por tema: preferida/aceptables/deal-breakers + severidad) y PlaybookReview +
-- PlaybookReviewFinding (informe por regla con SNAPSHOT de la regla y CITA obligatoria: fragmento
-- literal + offsets verificados sobre el texto extraído del documento).

-- CreateEnum
CREATE TYPE "PlaybookSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PlaybookFindingStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "PlaybookFindingOutcome" AS ENUM ('COMPLIANT', 'DEVIATION', 'MISSING');

-- CreateTable
CREATE TABLE "Playbook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction" "Jurisdiction",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "preferredText" TEXT,
    "clauseId" TEXT,
    "acceptableText" TEXT,
    "dealBreakers" TEXT,
    "severity" "PlaybookSeverity" NOT NULL DEFAULT 'MEDIUM',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "playbookId" TEXT,
    "matterId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "playbookName" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookReviewFinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "ruleId" TEXT,
    "topic" TEXT NOT NULL,
    "severity" "PlaybookSeverity" NOT NULL,
    "preferredText" TEXT,
    "acceptableText" TEXT,
    "dealBreakers" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "PlaybookFindingStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "PlaybookFindingOutcome",
    "dealBreaker" BOOLEAN NOT NULL DEFAULT false,
    "analysis" TEXT,
    "confidence" TEXT,
    "snippet" TEXT,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "context" TEXT,
    "error" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookReviewFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Playbook_tenantId_idx" ON "Playbook"("tenantId");

-- CreateIndex
CREATE INDEX "PlaybookRule_tenantId_playbookId_idx" ON "PlaybookRule"("tenantId", "playbookId");

-- CreateIndex
CREATE INDEX "PlaybookReview_tenantId_matterId_updatedAt_idx" ON "PlaybookReview"("tenantId", "matterId", "updatedAt");

-- CreateIndex
CREATE INDEX "PlaybookReviewFinding_tenantId_reviewId_idx" ON "PlaybookReviewFinding"("tenantId", "reviewId");

-- AddForeignKey
ALTER TABLE "Playbook" ADD CONSTRAINT "Playbook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookRule" ADD CONSTRAINT "PlaybookRule_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "Clause"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookReview" ADD CONSTRAINT "PlaybookReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookReview" ADD CONSTRAINT "PlaybookReview_playbookId_fkey" FOREIGN KEY ("playbookId") REFERENCES "Playbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookReview" ADD CONSTRAINT "PlaybookReview_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookReviewFinding" ADD CONSTRAINT "PlaybookReviewFinding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybookReviewFinding" ADD CONSTRAINT "PlaybookReviewFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PlaybookReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ──────────────────────────────────────────────
ALTER TABLE "Playbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Playbook" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Playbook"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Playbook" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Playbook" TO legalflow_system;

ALTER TABLE "PlaybookRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlaybookRule"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookRule" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookRule" TO legalflow_system;

ALTER TABLE "PlaybookReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlaybookReview"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookReview" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookReview" TO legalflow_system;

ALTER TABLE "PlaybookReviewFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookReviewFinding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlaybookReviewFinding"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookReviewFinding" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookReviewFinding" TO legalflow_system;
