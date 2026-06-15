-- Postgres Row-Level Security (RLS) como DEFENSA EN PROFUNDIDAD del aislamiento multi-tenant.
--
-- El aislamiento primario sigue siendo a nivel de aplicación (cada query filtra por tenantId del
-- usuario autenticado). RLS añade una segunda barrera en la base de datos: aunque un servicio
-- olvidara un filtro `tenantId`, Postgres no devolvería filas de otro tenant mientras exista
-- contexto de tenant en la conexión.
--
-- MECANISMO: la app fija `app.tenant_id` (GUC, transaction-local) por request con el tenant del
-- usuario autenticado. Las políticas comparan `tenantId` contra ese valor.
--
-- BYPASS CONTROLADO: cuando NO hay contexto de tenant, las políticas permiten todo. Esto cubre,
-- intencionadamente, las rutas de sistema que necesitan acceso cross-tenant y se ejecutan SIN
-- usuario autenticado: login (busca el email entre tenants), registro de despacho (crea el tenant),
-- rotación de refresh tokens y siembra del catálogo global. Ver DECISIONS D-013.
--
-- IMPORTANTE (sutileza de Postgres): un GUC de tipo "placeholder" (con punto, p. ej. app.tenant_id)
-- que se ha fijado alguna vez en la sesión se RESETEA a cadena vacía '' (no a NULL) al terminar la
-- transacción. Por eso "sin contexto" debe tratar NULL y '' por igual. La función helper lo
-- normaliza con NULLIF para que el bypass sea fiable en conexiones reutilizadas del pool.
--
-- FORCE: la app conecta como rol de mínimo privilegio (no propietario, no superusuario, ver
-- 20260614121000_app_role); además forzamos RLS para que aplique también si alguien conectara como
-- propietario.

-- Tenant efectivo de la conexión: NULL cuando no hay contexto (NULL o '' → ruta de sistema).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas con columna `tenantId` directa.
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
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (app_current_tenant() IS NULL OR "tenantId" = app_current_tenant())
        WITH CHECK (app_current_tenant() IS NULL OR "tenantId" = app_current_tenant());
    $f$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tenant: el identificador es la propia clave del tenant.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (app_current_tenant() IS NULL OR "id" = app_current_tenant())
  WITH CHECK (app_current_tenant() IS NULL OR "id" = app_current_tenant());

-- ─────────────────────────────────────────────────────────────────────────────
-- InvoiceLine: no tiene `tenantId` propio; se ancla al tenant de su factura.
-- (La subconsulta sobre "Invoice" también está sujeta a su propia RLS, lo que es coherente:
--  con un tenant fijado, solo "ve" las facturas de ese tenant.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InvoiceLine"
  USING (
    app_current_tenant() IS NULL
    OR EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i."id" = "InvoiceLine"."invoiceId" AND i."tenantId" = app_current_tenant()
    )
  )
  WITH CHECK (
    app_current_tenant() IS NULL
    OR EXISTS (
      SELECT 1 FROM "Invoice" i
      WHERE i."id" = "InvoiceLine"."invoiceId" AND i."tenantId" = app_current_tenant()
    )
  );

-- NOTA: NO se aplica RLS a `Permission` (catálogo global sin tenant), ni a las tablas puente
-- `RolePermission`/`UserRole` (acceso siempre vía sus padres ya protegidos), ni a `RefreshToken`
-- (clave por userId; solo se accede en rutas de sistema por hash de token). Ver DECISIONS D-013.
