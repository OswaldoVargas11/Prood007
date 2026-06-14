-- Rol de aplicación de MÍNIMO PRIVILEGIO para que RLS sea efectiva.
--
-- Postgres NO aplica políticas RLS a superusuarios ni a roles con BYPASSRLS (ni siquiera con
-- FORCE). Por eso el runtime de la app debe conectar como un rol normal (sin superusuario, sin
-- BYPASSRLS, sin ser propietario de las tablas), con solo permisos DML. Las MIGRACIONES siguen
-- usando el rol propietario/privilegiado a través de `directUrl` (ver schema.prisma y DECISIONS D-013).
--
-- Esta migración corre con el rol privilegiado (directUrl). Es idempotente: en producción el rol
-- puede provisionarse fuera de banda con una contraseña fuerte y aquí solo se (re)aplican los GRANT;
-- el CREATE ROLE se omite si ya existe. La contraseña por defecto es solo para dev/CI.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'legalflow_app') THEN
    CREATE ROLE legalflow_app LOGIN PASSWORD 'legalflow_app';
  END IF;
END $$;

-- Asegurar que NO puede saltarse RLS (defensivo, por si el rol existiera con otros atributos).
ALTER ROLE legalflow_app NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;

GRANT USAGE ON SCHEMA public TO legalflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legalflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legalflow_app;

-- Privilegios por defecto para objetos que cree el rol propietario en el futuro (próximas migraciones).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO legalflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO legalflow_app;
