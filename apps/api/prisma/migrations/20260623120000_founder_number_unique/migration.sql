-- Red de seguridad del cupo Fundador global: impide founderNumber duplicado bajo concurrencia
-- (la concesión ya se serializa con pg_advisory_xact_lock(3,0) en applySubscription).
-- Postgres permite múltiples NULL en un índice único, así que los tenants no-fundadores no se ven afectados.
CREATE UNIQUE INDEX "Tenant_founderNumber_key" ON "Tenant"("founderNumber");
