-- Persistencia del chat del asistente agéntico (Zora). Cada conversación es PRIVADA del usuario que la
-- inició (no se comparte con el resto del staff). Independiente del chat social interno (Conversation/
-- ChatMessage). Aislamiento por tenant con RLS fail-closed (igual que messaging_social).

-- ── AiConversation ──────────────────────────────────────────────────────────
CREATE TABLE "AiConversation" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);
-- Bandeja del dock: los chats del usuario por actividad reciente.
CREATE INDEX "AiConversation_tenantId_userId_updatedAt_idx" ON "AiConversation"("tenantId", "userId", "updatedAt");

ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── AiChatMessage ───────────────────────────────────────────────────────────
CREATE TABLE "AiChatMessage" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role"           TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "meta"           JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiChatMessage_tenantId_conversationId_createdAt_idx" ON "AiChatMessage"("tenantId", "conversationId", "createdAt");

ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ──────────────────────────────────────────────
ALTER TABLE "AiConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiConversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiConversation"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiConversation" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiConversation" TO legalflow_system;

ALTER TABLE "AiChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiChatMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiChatMessage"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiChatMessage" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiChatMessage" TO legalflow_system;
