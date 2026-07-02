-- Revisión tabular de documentos (estilo Legora): TabularReview (definición: columnas en lenguaje
-- natural + documentos fila) + TabularReviewCell (celda documento×columna con estado de extracción y
-- CITA obligatoria: fragmento literal + offsets verificados sobre el texto extraído).

-- CreateEnum
CREATE TYPE "TabularCellStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "TabularReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "documents" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabularReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabularReviewCell" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "status" "TabularCellStatus" NOT NULL DEFAULT 'PENDING',
    "value" TEXT,
    "notFound" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT,
    "snippet" TEXT,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "page" INTEGER,
    "context" TEXT,
    "error" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TabularReviewCell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TabularReview_tenantId_matterId_updatedAt_idx" ON "TabularReview"("tenantId", "matterId", "updatedAt");

-- CreateIndex
CREATE INDEX "TabularReviewCell_tenantId_reviewId_idx" ON "TabularReviewCell"("tenantId", "reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "TabularReviewCell_reviewId_documentId_columnId_key" ON "TabularReviewCell"("reviewId", "documentId", "columnId");

-- AddForeignKey
ALTER TABLE "TabularReview" ADD CONSTRAINT "TabularReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabularReview" ADD CONSTRAINT "TabularReview_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabularReviewCell" ADD CONSTRAINT "TabularReviewCell_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TabularReviewCell" ADD CONSTRAINT "TabularReviewCell_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "TabularReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ──────────────────────────────────────────────
ALTER TABLE "TabularReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TabularReview" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TabularReview"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "TabularReview" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TabularReview" TO legalflow_system;

ALTER TABLE "TabularReviewCell" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TabularReviewCell" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TabularReviewCell"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "TabularReviewCell" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TabularReviewCell" TO legalflow_system;
