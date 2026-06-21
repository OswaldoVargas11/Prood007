-- Índice semántico para búsqueda con IA (RAG). Fragmentos de expedientes/documentos + su vector de
-- embedding (DOUBLE PRECISION[]). La similitud coseno se calcula en la app sobre los vectores del tenant
-- (escala de despacho; sin pgvector ni extensión). Tenant-scoped con RLS fail-closed, como el resto.
CREATE TABLE "AiEmbedding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "refLabel" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEmbedding_tenantId_idx" ON "AiEmbedding"("tenantId");

-- CreateIndex
CREATE INDEX "AiEmbedding_tenantId_kind_refId_idx" ON "AiEmbedding"("tenantId", "kind", "refId");

-- AddForeignKey
ALTER TABLE "AiEmbedding" ADD CONSTRAINT "AiEmbedding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "AiEmbedding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiEmbedding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiEmbedding"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "AiEmbedding" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiEmbedding" TO legalflow_system;
