-- Mensajería interna del despacho (chat social del staff): DM 1:1 (DIRECT) y canales (CHANNEL, p. ej.
-- «General»). Independiente del chat por expediente (Message). Solo staff; aislamiento por tenant con
-- RLS fail-closed (igual que MatterReadState).

CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'CHANNEL');

-- ── Conversation ────────────────────────────────────────────────────────────
CREATE TABLE "Conversation" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "kind"      "ConversationKind" NOT NULL,
    "title"     TEXT,
    "directKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
-- Idempotencia: un único DM por par de usuarios y un único canal «General» por despacho.
-- Postgres no considera iguales dos NULL, así que otros canales sin directKey no colisionan.
CREATE UNIQUE INDEX "Conversation_tenantId_directKey_key" ON "Conversation"("tenantId", "directKey");
CREATE INDEX "Conversation_tenantId_idx" ON "Conversation"("tenantId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ConversationMember ──────────────────────────────────────────────────────
CREATE TABLE "ConversationMember" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "lastReadAt"     TIMESTAMP(3),

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConversationMember_conversationId_userId_key" ON "ConversationMember"("conversationId", "userId");
CREATE INDEX "ConversationMember_tenantId_idx" ON "ConversationMember"("tenantId");
CREATE INDEX "ConversationMember_tenantId_userId_idx" ON "ConversationMember"("tenantId", "userId");

ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ChatMessage ─────────────────────────────────────────────────────────────
CREATE TABLE "ChatMessage" (
    "id"                   TEXT NOT NULL,
    "tenantId"             TEXT NOT NULL,
    "conversationId"       TEXT NOT NULL,
    "authorId"             TEXT NOT NULL,
    "body"                 TEXT NOT NULL,
    "reactions"            JSONB,
    "attachmentDocumentId" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatMessage_tenantId_conversationId_idx" ON "ChatMessage"("tenantId", "conversationId");

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ──────────────────────────────────────────────
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Conversation"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO legalflow_system;

ALTER TABLE "ConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationMember" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConversationMember"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ConversationMember" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ConversationMember" TO legalflow_system;

ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ChatMessage"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatMessage" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatMessage" TO legalflow_system;
