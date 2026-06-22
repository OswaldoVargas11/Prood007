-- Auto-agenda del portal: disponibilidad del abogado + citas. Tenant-scoped con RLS fail-closed.
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "SchedulingConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "weekdays" INTEGER[],
    "startMin" INTEGER NOT NULL DEFAULT 540,
    "endMin" INTEGER NOT NULL DEFAULT 1080,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchedulingConfig_lawyerId_key" ON "SchedulingConfig"("lawyerId");
CREATE INDEX "SchedulingConfig_tenantId_idx" ON "SchedulingConfig"("tenantId");

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lawyerId" TEXT NOT NULL,
    "clientId" TEXT,
    "matterId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Appointment_tenantId_lawyerId_startsAt_idx" ON "Appointment"("tenantId", "lawyerId", "startsAt");
CREATE INDEX "Appointment_tenantId_clientId_idx" ON "Appointment"("tenantId", "clientId");

-- Foreign keys
ALTER TABLE "SchedulingConfig" ADD CONSTRAINT "SchedulingConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulingConfig" ADD CONSTRAINT "SchedulingConfig_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_lawyerId_fkey" FOREIGN KEY ("lawyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS FAIL-CLOSED por tenant.
ALTER TABLE "SchedulingConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SchedulingConfig" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SchedulingConfig"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment"
    USING ("tenantId" = app_current_tenant())
    WITH CHECK ("tenantId" = app_current_tenant());

GRANT SELECT, INSERT, UPDATE, DELETE ON "SchedulingConfig" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SchedulingConfig" TO legalflow_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Appointment" TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Appointment" TO legalflow_system;
