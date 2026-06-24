-- Plantillas de tarea/plazo por tipo de presentación: al aplicar el tipo a un expediente se crean
-- tareas con vencimiento relativo (offsetDays). Tenant-scoped con RLS fail-closed.

CREATE TABLE "PresentationTaskTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "presentationTypeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PresentationTaskTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PresentationTaskTemplate_tenantId_idx" ON "PresentationTaskTemplate"("tenantId");
CREATE INDEX "PresentationTaskTemplate_presentationTypeId_idx" ON "PresentationTaskTemplate"("presentationTypeId");

ALTER TABLE "PresentationTaskTemplate" ADD CONSTRAINT "PresentationTaskTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PresentationTaskTemplate" ADD CONSTRAINT "PresentationTaskTemplate_presentationTypeId_fkey" FOREIGN KEY ("presentationTypeId") REFERENCES "PresentationType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "PresentationTaskTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PresentationTaskTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PresentationTaskTemplate"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationTaskTemplate" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PresentationTaskTemplate" TO legalflow_system;
