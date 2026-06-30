-- Constructor de flujos agénticos multi-paso (Zora workflows builder, LAW-22). Una definición declarativa
-- de workflow encadena herramientas del catálogo del agente (AGENT_TOOLS) y se ejecuta en orden, respetando
-- el gate HITL ya existente para acciones de escritura. Aislamiento por tenant con RLS fail-closed (igual
-- que ai_chat_persistence). A diferencia de AiConversation, el workflow es COMPARTIDO por el despacho.

-- ── AiWorkflow ──────────────────────────────────────────────────────────────
CREATE TABLE "AiWorkflow" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "steps"           JSONB NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiWorkflow_pkey" PRIMARY KEY ("id")
);
-- Listado del despacho por actividad reciente.
CREATE INDEX "AiWorkflow_tenantId_updatedAt_idx" ON "AiWorkflow"("tenantId", "updatedAt");

ALTER TABLE "AiWorkflow" ADD CONSTRAINT "AiWorkflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AiWorkflowRun ───────────────────────────────────────────────────────────
CREATE TABLE "AiWorkflowRun" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "workflowId"      TEXT NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "status"          TEXT NOT NULL,
    "stepResults"     JSONB NOT NULL,
    "pendingWrites"   JSONB NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiWorkflowRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiWorkflowRun_tenantId_workflowId_createdAt_idx" ON "AiWorkflowRun"("tenantId", "workflowId", "createdAt");

ALTER TABLE "AiWorkflowRun" ADD CONSTRAINT "AiWorkflowRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiWorkflowRun" ADD CONSTRAINT "AiWorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AiWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ──────────────────────────────────────────────
ALTER TABLE "AiWorkflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiWorkflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiWorkflow"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiWorkflow" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiWorkflow" TO legalflow_system;

ALTER TABLE "AiWorkflowRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiWorkflowRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiWorkflowRun"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiWorkflowRun" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiWorkflowRun" TO legalflow_system;
