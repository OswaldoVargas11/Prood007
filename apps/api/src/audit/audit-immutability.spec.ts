import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regresión de INMUTABILIDAD de AuditLog (D10-001 / OBS-2 · LAW-7/LAW-15).
 *
 * AuditLog es append-only y esa propiedad es regulatoria (trazabilidad/no repudio) y de seguridad. La
 * garantía vive en dos capas de la base de datos, ambas committeadas como migraciones:
 *
 *   1. Privilegios   — `REVOKE UPDATE, DELETE ON "AuditLog" FROM legalflow_app`
 *                      (migración 20260624120000_fiscal_audit_immutability).
 *   2. Trigger       — `audit_log_append_only` BEFORE UPDATE OR DELETE, que hace cumplir el invariante
 *                      aunque un GRANT futuro deshaga el REVOKE
 *                      (migración 20260630120000_auditlog_append_only_trigger).
 *
 * Este test es el gate determinista que IMPIDE que esas dos líneas de defensa se borren o se debiliten
 * por accidente: si alguien retira el REVOKE, quita el trigger, lo cambia a AFTER, o abre el borrado al
 * rol de aplicación, el test FALLA. No necesita base de datos (igual filosofía que el golden-file
 * fiscal): verifica el CONTRATO SQL committeado. La verificación viva contra un Postgres real con los
 * roles `legalflow_app`/`legalflow_system` se documenta como prueba manual del owner.
 */
describe('AuditLog append-only — contrato de migraciones (D10-001)', () => {
  const migrationsDir = join(__dirname, '..', '..', 'prisma', 'migrations');

  const readMigration = (name: string): string =>
    readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');

  // Normaliza espacios para que el assert no dependa del formateo exacto.
  const squish = (sql: string): string => sql.replace(/\s+/g, ' ');

  describe('Capa 1 — separación de privilegios (REVOKE)', () => {
    const sql = squish(readMigration('20260624120000_fiscal_audit_immutability'));

    it('retira UPDATE y DELETE de AuditLog al rol de aplicación', () => {
      expect(sql).toMatch(/REVOKE\s+UPDATE,\s*DELETE\s+ON\s+"AuditLog"\s+FROM\s+legalflow_app/i);
    });

    it('nunca re-concede UPDATE/DELETE de AuditLog al rol de aplicación', () => {
      expect(sql).not.toMatch(/GRANT[^;]*\b(UPDATE|DELETE)\b[^;]*ON\s+"AuditLog"\s+TO\s+legalflow_app/i);
    });
  });

  describe('Capa 2 — trigger append-only (defensa en profundidad)', () => {
    const sql = readMigration('20260630120000_auditlog_append_only_trigger');
    const flat = squish(sql);

    it('define la función guardiana audit_log_block_mutation', () => {
      expect(flat).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+audit_log_block_mutation\s*\(\s*\)/i);
    });

    it('bloquea cualquier UPDATE con una excepción', () => {
      // Debe lanzar excepción cuando la operación es UPDATE, sin condicionarlo a ningún rol.
      expect(flat).toMatch(/IF\s+TG_OP\s*=\s*'UPDATE'\s+THEN\s+RAISE\s+EXCEPTION/i);
    });

    it('bloquea el DELETE específicamente para el rol de aplicación', () => {
      expect(flat).toMatch(
        /IF\s+TG_OP\s*=\s*'DELETE'\s+AND\s+current_user\s*=\s*'legalflow_app'\s+THEN\s+RAISE\s+EXCEPTION/i,
      );
    });

    it('instala el trigger BEFORE UPDATE OR DELETE, FOR EACH ROW, sobre AuditLog', () => {
      expect(flat).toMatch(
        /CREATE\s+TRIGGER\s+audit_log_append_only\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+"AuditLog"\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+audit_log_block_mutation\s*\(\s*\)/i,
      );
    });

    it('no es un trigger AFTER (un AFTER no puede impedir la mutación)', () => {
      expect(flat).not.toMatch(/CREATE\s+TRIGGER\s+audit_log_append_only\s+AFTER/i);
    });

    it('es idempotente (DROP TRIGGER IF EXISTS antes de crearlo)', () => {
      expect(flat).toMatch(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+audit_log_append_only\s+ON\s+"AuditLog"/i);
    });
  });
});
