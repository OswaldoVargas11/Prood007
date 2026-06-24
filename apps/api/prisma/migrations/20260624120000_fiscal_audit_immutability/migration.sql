-- ─────────────────────────────────────────────────────────────────────────────
-- Inalterabilidad fiscal + auditoría append-only (auditoría 2026-06-24 · D8-001/D8-002/D8-004/D10-001)
--
-- RRSIF/Verifactu y e-CF exigen que un registro de facturación emitido sea INALTERABLE y que su borrado
-- deje traza. El control central NO es un trigger con escape (cualquier escape que pueda invocar el rol de
-- app, lo invoca también un atacante con esa credencial), sino la SEPARACIÓN DE PRIVILEGIOS a nivel de
-- columna: el rol de aplicación (`legalflow_app`, NOBYPASSRLS) pierde UPDATE sobre las columnas fiscales y
-- DELETE sobre la factura; solo conserva UPDATE de las columnas de CICLO DE VIDA (cobro, estado e-CF). El
-- rol de sistema mantiene todos los permisos (borrado en cascada al eliminar un tenant).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) AiUsage: contabilidad de tokens (la cuota de coste se aplica sobre tokens, no sobre nº de llamadas).
ALTER TABLE "AiUsage" ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsage" ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;

-- 2) Contador monótono de emisión por tenant (sustituye COUNT(*)+1 → sin huecos ni duplicados).
CREATE TABLE "InvoiceSequence" (
    "tenantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("tenantId", "scope")
);
CREATE INDEX "InvoiceSequence_tenantId_idx" ON "InvoiceSequence"("tenantId");

ALTER TABLE "InvoiceSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InvoiceSequence"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "InvoiceSequence" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "InvoiceSequence" TO legalflow_system;

-- 3) Registro de eventos fiscal INMUTABLE y encadenado (RRSIF registro de eventos).
CREATE TABLE "FiscalEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recordHash" TEXT NOT NULL,
    "previousEventHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FiscalEvent_tenantId_createdAt_idx" ON "FiscalEvent"("tenantId", "createdAt");
CREATE INDEX "FiscalEvent_tenantId_invoiceId_idx" ON "FiscalEvent"("tenantId", "invoiceId");

ALTER TABLE "FiscalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FiscalEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FiscalEvent"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
-- Append-only para el rol de app: SOLO SELECT + INSERT (sin UPDATE/DELETE → no puede reescribir ni borrar
-- su propio rastro fiscal). El rol de sistema conserva todo para el borrado en cascada del tenant.
GRANT SELECT, INSERT ON "FiscalEvent" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FiscalEvent" TO legalflow_system;

-- 4) Invoice: INALTERABILIDAD por privilegios de columna (D8-001).
--    Se retira el UPDATE de tabla al rol de app y se re-concede SOLO sobre columnas de ciclo de vida:
--    cobro (status/paidAt/amountPaid/dueDate) y estado de transmisión e-CF (ecf*), + updatedAt (Prisma).
--    Las columnas fiscales (number, issueDate, total, taxableBase, taxAmount, withholdingAmount,
--    complianceRecord/Format, recordHash, previousRecordHash, documentType, rectifies*) quedan SIN UPDATE.
REVOKE UPDATE ON "Invoice" FROM legalflow_app;
GRANT UPDATE ("status", "paidAt", "amountPaid", "dueDate",
              "ecfStatus", "ecfStatusDetail", "ecfTrackId", "ecfSubmittedAt", "updatedAt")
    ON "Invoice" TO legalflow_app;
-- Una factura emitida no se borra desde la aplicación (no existe tal flujo). El borrado en cascada al
-- eliminar un tenant lo ejecuta el rol de sistema, que conserva DELETE.
REVOKE DELETE ON "Invoice" FROM legalflow_app;

-- 5) AuditLog: APPEND-ONLY (D10-001). El rol de app no puede modificar ni borrar el rastro de auditoría;
--    el rol de sistema conserva DELETE para el borrado en cascada del tenant.
REVOKE UPDATE, DELETE ON "AuditLog" FROM legalflow_app;
