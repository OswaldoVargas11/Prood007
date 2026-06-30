-- ─────────────────────────────────────────────────────────────────────────────
-- AuditLog APPEND-ONLY reforzado con trigger (auditoría 2026-06-24 · D10-001 / OBS-2 · LAW-7/LAW-15)
--
-- La migración `20260624120000_fiscal_audit_immutability` ya retiró UPDATE/DELETE al rol de aplicación
-- (`REVOKE UPDATE, DELETE ON "AuditLog" FROM legalflow_app`). Esa es la PRIMERA línea de defensa: una
-- separación de privilegios a nivel de tabla. Pero un REVOKE puede deshacerse con un GRANT posterior
-- (una migración futura descuidada, un DBA, un `ALTER DEFAULT PRIVILEGES`); cuando eso pasa, el rastro
-- de auditoría vuelve a ser mutable SIN que nadie lo note.
--
-- Esta migración añade la SEGUNDA línea de defensa, independiente de los privilegios: un trigger
-- `BEFORE UPDATE OR DELETE` que hace cumplir el invariante de inmutabilidad pase lo que pase con los
-- GRANT. Los triggers se ejecutan para TODOS los roles (incluido un rol BYPASSRLS como
-- `legalflow_system`); solo un superusuario podría saltárselos vía `session_replication_role`, que la
-- aplicación nunca usa.
--
-- Política del invariante:
--   · UPDATE  → PROHIBIDO para cualquier rol. Una entrada de auditoría nunca se reescribe; el ciclo de
--               vida normal (incluido el borrado en cascada de un tenant) jamás actualiza estas filas.
--   · DELETE  → PROHIBIDO para el rol de aplicación (`legalflow_app`). Se tolera para el rol de sistema
--               y el propietario/superusuario, porque el borrado en cascada al eliminar un tenant lo
--               ejecuta `legalflow_system` (BYPASSRLS) y debe seguir funcionando. El rol de app NUNCA
--               borra auditoría, ni siquiera si alguien le re-concede el privilegio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'AuditLog es append-only: UPDATE no está permitido (id=%).', OLD."id"
            USING ERRCODE = 'restrict_violation',
                  HINT = 'El registro de auditoría es inmutable; nunca se modifica una entrada existente.';
    END IF;

    -- DELETE: solo el rol de aplicación queda bloqueado. El rol de sistema (cascada de tenant) y el
    -- propietario conservan la capacidad de borrar para no romper el borrado en cascada del despacho.
    IF TG_OP = 'DELETE' AND current_user = 'legalflow_app' THEN
        RAISE EXCEPTION 'AuditLog es append-only: el rol de aplicación no puede borrar auditoría (id=%).', OLD."id"
            USING ERRCODE = 'restrict_violation',
                  HINT = 'El borrado de auditoría solo es legítimo en el borrado en cascada del tenant (rol de sistema).';
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";
CREATE TRIGGER audit_log_append_only
    BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
