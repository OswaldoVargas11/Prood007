-- Suscripción a avisos de cambios de subprocesadores (art. 28.2 RGPD: notificación previa + oposición).
-- Opt-in por email, por tenant, con RLS fail-closed.

CREATE TABLE "SubprocessorSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubprocessorSubscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubprocessorSubscription_tenantId_idx" ON "SubprocessorSubscription"("tenantId");
CREATE UNIQUE INDEX "SubprocessorSubscription_tenantId_email_key" ON "SubprocessorSubscription"("tenantId", "email");

ALTER TABLE "SubprocessorSubscription" ADD CONSTRAINT "SubprocessorSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubprocessorSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubprocessorSubscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SubprocessorSubscription"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, DELETE ON "SubprocessorSubscription" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SubprocessorSubscription" TO legalflow_system;
