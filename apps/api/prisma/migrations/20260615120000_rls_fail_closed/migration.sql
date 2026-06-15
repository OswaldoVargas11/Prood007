-- RLS FAIL-CLOSED + rol de SISTEMA con BYPASSRLS (endurecimiento del aislamiento multi-tenant).
--
-- CAMBIO RESPECTO A 20260614120000_enable_rls (que era FAIL-OPEN):
--   Antes, sin contexto de tenant (`app.tenant_id` sin fijar) las políticas permitían TODO
--   (`app_current_tenant() IS NULL OR ...`). Eso convertía un olvido de contexto en cualquier punto
--   del código en una fuga cross-tenant silenciosa: el aislamiento dependía de "acordarse" de fijar
--   el GUC. Ahora es FAIL-CLOSED: sin contexto → CERO filas (y los INSERT se rechazan por WITH CHECK).
--
-- RUTAS CROSS-TENANT LEGÍTIMAS (login que busca el email entre despachos, registro de despacho que
--   crea el tenant, carga del usuario para emitir tokens) YA NO pasan por "ausencia de contexto":
--   pasan EXPLÍCITAMENTE por un rol de sistema con BYPASSRLS (`legalflow_system`), conectado por la
--   app mediante `SYSTEM_DATABASE_URL`. El bypass es un privilegio de rol deliberado, no un descuido.
--   Ver DECISIONS D-020.
--
-- Esta migración corre con el rol privilegiado (directUrl). CREATE ROLE ... BYPASSRLS exige
-- superusuario (lo es en dev/CI). En producción el rol se provisiona fuera de banda con contraseña
-- fuerte y aquí solo se (re)aplican los GRANT. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Rol de SISTEMA con BYPASSRLS para las rutas cross-tenant legítimas.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'legalflow_system') THEN
    CREATE ROLE legalflow_system LOGIN PASSWORD 'legalflow_system' BYPASSRLS;
  END IF;
END $$;

-- Atributos deseados (defensivo, por si el rol existiera con otros): puede saltarse RLS, pero NO es
-- superusuario y no puede crear roles/bases. La contraseña por defecto es solo para dev/CI.
ALTER ROLE legalflow_system NOSUPERUSER BYPASSRLS NOCREATEROLE NOCREATEDB;

GRANT USAGE ON SCHEMA public TO legalflow_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalflow_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalflow_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legalflow_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legalflow_system;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Políticas FAIL-CLOSED: se elimina la cláusula de bypass `app_current_tenant() IS NULL OR ...`.
--    Sin contexto, `app_current_tenant()` es NULL → `"tenantId" = NULL` es NULL → la fila no pasa
--    ni el USING (lectura) ni el WITH CHECK (escritura). La función helper no cambia.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'User', 'Role', 'Client', 'Matter', 'Document', 'DocumentVersion', 'DocumentReview',
    'Task', 'TimeEntry', 'LedgerEntry', 'Invoice', 'Notification', 'Message', 'AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = app_current_tenant())
        WITH CHECK ("tenantId" = app_current_tenant());
    $f$, t);
  END LOOP;
END $$;

-- Tenant: el identificador es la propia clave del tenant.
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING ("id" = app_current_tenant())
  WITH CHECK ("id" = app_current_tenant());

-- InvoiceLine: anclada al tenant de su factura (sin la cláusula de bypass).
DROP POLICY IF EXISTS tenant_isolation ON "InvoiceLine";
CREATE POLICY tenant_isolation ON "InvoiceLine"
  USING (
    EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i."id" = "InvoiceLine"."invoiceId" AND i."tenantId" = app_current_tenant()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i."id" = "InvoiceLine"."invoiceId" AND i."tenantId" = app_current_tenant()
    )
  );
