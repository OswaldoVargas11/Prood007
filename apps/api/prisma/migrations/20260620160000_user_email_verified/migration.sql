-- Verificación de email (anti-bots). Columna nueva en User; hereda RLS/grants de la tabla.
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Grandfathering: los usuarios YA EXISTENTES se consideran verificados para no bloquear cuentas en uso.
-- Solo las cuentas nuevas (auto-registro) nacerán sin verificar y deberán confirmar su correo.
UPDATE "User" SET "emailVerified" = true;
