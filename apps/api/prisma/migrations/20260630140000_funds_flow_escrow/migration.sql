-- Funds-flow / closing statement + ledger de escrow (T-1 profundidad transaccional).
--  · DealFundsFlowLine: quién paga qué, a quién, en qué cuenta y bajo qué condición (cuadre POR moneda).
--  · EscrowHolding (+ EscrowRelease): depósitos en garantía con importes y workflow HELD→…→RELEASED.
-- Es REGISTRO/documento de la operación — NO mueve dinero real (no toca cobros/Stripe).
-- Todo tenant-scoped con RLS fail-closed (mismo patrón que el resto del módulo deal).

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "FundsFlowKind" AS ENUM ('PAYMENT', 'ESCROW_DEPOSIT', 'ESCROW_RELEASE', 'FEE', 'ADJUSTMENT');
CREATE TYPE "FundsFlowStatus" AS ENUM ('PLANNED', 'SETTLED');
CREATE TYPE "EscrowStatus" AS ENUM ('HELD', 'PARTIALLY_RELEASED', 'RELEASED');

-- ── Tablas nuevas ────────────────────────────────────────────────────────────
CREATE TABLE "DealFundsFlowLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "kind" "FundsFlowKind" NOT NULL DEFAULT 'PAYMENT',
    "payerPartyId" TEXT,
    "payeePartyId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "account" TEXT,
    "condition" TEXT,
    "status" "FundsFlowStatus" NOT NULL DEFAULT 'PLANNED',
    "settledAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealFundsFlowLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EscrowHolding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "agent" TEXT,
    "depositedAt" TIMESTAMP(3),
    "releaseTrigger" TEXT,
    "status" "EscrowStatus" NOT NULL DEFAULT 'HELD',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowHolding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EscrowRelease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscrowRelease_pkey" PRIMARY KEY ("id")
);

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX "DealFundsFlowLine_tenantId_idx" ON "DealFundsFlowLine"("tenantId");
CREATE INDEX "DealFundsFlowLine_tenantId_matterId_idx" ON "DealFundsFlowLine"("tenantId", "matterId");
CREATE INDEX "EscrowHolding_tenantId_idx" ON "EscrowHolding"("tenantId");
CREATE INDEX "EscrowHolding_tenantId_matterId_idx" ON "EscrowHolding"("tenantId", "matterId");
CREATE INDEX "EscrowRelease_tenantId_idx" ON "EscrowRelease"("tenantId");
CREATE INDEX "EscrowRelease_holdingId_idx" ON "EscrowRelease"("holdingId");

-- ── Claves foráneas ──────────────────────────────────────────────────────────
ALTER TABLE "DealFundsFlowLine" ADD CONSTRAINT "DealFundsFlowLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealFundsFlowLine" ADD CONSTRAINT "DealFundsFlowLine_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscrowHolding" ADD CONSTRAINT "EscrowHolding_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscrowHolding" ADD CONSTRAINT "EscrowHolding_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscrowRelease" ADD CONSTRAINT "EscrowRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscrowRelease" ADD CONSTRAINT "EscrowRelease_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "EscrowHolding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS FAIL-CLOSED por tenant ───────────────────────────────────────────────
ALTER TABLE "DealFundsFlowLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DealFundsFlowLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DealFundsFlowLine"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealFundsFlowLine" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DealFundsFlowLine" TO legalflow_system;

ALTER TABLE "EscrowHolding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscrowHolding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EscrowHolding"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "EscrowHolding" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EscrowHolding" TO legalflow_system;

ALTER TABLE "EscrowRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscrowRelease" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EscrowRelease"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "EscrowRelease" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EscrowRelease" TO legalflow_system;
