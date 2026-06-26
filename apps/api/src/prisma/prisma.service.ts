import { Prisma, PrismaClient } from '@prisma/client';
import { tenantStorage } from './tenant-context';

/**
 * Extensión que hace que Postgres RLS se aplique en runtime (defensa en profundidad).
 *
 * La app conecta como rol de mínimo privilegio (sin superusuario) y debe fijar `app.tenant_id` en la
 * conexión antes de cada query. Como el pool de Prisma no garantiza la misma conexión entre queries,
 * cada operación de modelo se envuelve en una transacción que primero ejecuta `set_config(...)`
 * (transaction-local) y luego la query, en la MISMA transacción/conexión (patrón oficial de Prisma).
 *
 * No se envuelve cuando: no hay tenant en contexto (rutas de sistema → bypass), ya estamos dentro de
 * una `tenantTransaction` (`inTenantTx`, el GUC ya está fijado), o la operación no es de modelo.
 */
const rlsExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      async $allOperations({ model, args, query }): Promise<unknown> {
        const ctx = tenantStorage.getStore();
        if (!ctx?.tenantId || ctx.inTenantTx || !model) {
          return query(args);
        }
        const [, result] = await client.$transaction([
          client.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  }),
);

export function createTenantAwarePrisma() {
  return new PrismaClient().$extends(rlsExtension);
}

export type TenantAwarePrisma = ReturnType<typeof createTenantAwarePrisma>;

/**
 * M-4 (CWE-732): afirma al arranque que el rol con el que conecta la app (DATABASE_URL) es de MÍNIMO
 * privilegio. La inmutabilidad fiscal (no UPDATE sobre columnas de Invoice ya emitida) y la RLS dependen
 * de que ese rol NO sea superusuario, NO tenga BYPASSRLS y NO tenga UPDATE sobre las columnas fiscales.
 * Antes esto solo se garantizaba por convención de despliegue, sin verificación: una sola mala config
 * (apuntar DATABASE_URL a postgres/owner) anulaba silenciosamente toda la inmutabilidad.
 *
 * En PRODUCCIÓN es FATAL (aborta el arranque); en dev/CI solo avisa (allí la app suele conectar como
 * propietario y romper el arranque pesaría más que la separación estricta). Si la verificación no puede
 * ejecutarse (tabla aún sin migrar), no bloquea.
 */
export async function assertAppRoleLeastPrivilege(client: PrismaClient): Promise<void> {
  const isProd = process.env.NODE_ENV === 'production';
  let row:
    | { role: string; is_super: boolean; bypass_rls: boolean; can_update_total: boolean }
    | undefined;
  try {
    const rows = await client.$queryRaw<
      { role: string; is_super: boolean; bypass_rls: boolean; can_update_total: boolean }[]
    >`
      SELECT current_user::text AS role,
             COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS is_super,
             COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypass_rls,
             has_column_privilege('"Invoice"', 'total', 'UPDATE') AS can_update_total`;
    row = rows[0];
  } catch (err) {
    // p. ej. la tabla Invoice aún no existe (test/CI sin migrar): no bloquear el arranque.
    // eslint-disable-next-line no-console
    console.warn(
      `[seguridad] no se pudo verificar el privilegio del rol de la app: ${String(err)}`,
    );
    return;
  }
  if (!row) return;
  const violations: string[] = [];
  if (row.is_super) violations.push('es SUPERUSER');
  if (row.bypass_rls) violations.push('tiene BYPASSRLS (anula la RLS multi-tenant)');
  if (row.can_update_total) {
    violations.push('puede UPDATE sobre Invoice.total (anula la inmutabilidad fiscal)');
  }
  if (violations.length === 0) return;
  const msg =
    `El rol de la app (${row.role}) NO es de mínimo privilegio: ${violations.join('; ')}. ` +
    'Apunta DATABASE_URL al rol restringido (legalflow_app), no al propietario/superusuario.';
  if (isProd) throw new Error(msg);
  // eslint-disable-next-line no-console
  console.warn(`[seguridad] ${msg} (solo dev/CI; en producción esto abortaría el arranque)`);
}

/**
 * Token de inyección. Se declara extendiendo `PrismaClient` para que los servicios mantengan el
 * tipado de modelos y métodos; en runtime el provider devuelve el cliente extendido
 * (`createTenantAwarePrisma`). Ver prisma.module.ts.
 */
export class PrismaService extends PrismaClient {}

/**
 * Cliente de SISTEMA: conecta como rol BYPASSRLS (`legalflow_system`) vía `SYSTEM_DATABASE_URL`.
 *
 * Con RLS en FAIL-CLOSED (ver migración 20260615120000_rls_fail_closed / D-020), sin contexto de
 * tenant las queries devuelven CERO filas. Las pocas rutas cross-tenant LEGÍTIMAS que se ejecutan
 * sin usuario autenticado —login (busca el email entre despachos), registro de despacho (crea el
 * tenant) y carga del usuario para emitir tokens— usan ESTE cliente: el bypass es un privilegio de
 * rol deliberado y explícito, NO la ausencia de contexto. No lleva la extensión RLS (no fija el GUC).
 *
 * Es la "joya de la corona": `SYSTEM_DATABASE_URL` salta TODO el aislamiento. Secreto fuerte, aparte,
 * nunca logueado, nunca usado fuera de aquí. En **producción es obligatorio** declarar el rol dedicado
 * (`legalflow_system`): si falta, se LANZA un error de arranque en vez de "fallar hacia más privilegio"
 * corriendo como propietario/superusuario. El fallback a `DIRECT_DATABASE_URL` (con aviso) queda SOLO
 * para dev/CI, donde no romper el arranque pesa más que la separación estricta de roles.
 */
export class SystemPrismaService extends PrismaClient {}

export function createSystemPrisma() {
  let url = process.env.SYSTEM_DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SYSTEM_DATABASE_URL no está definido. En producción el rol de sistema (legalflow_system, ' +
          'BYPASSRLS) debe declararse explícitamente; no se admite el fallback a DIRECT_DATABASE_URL ' +
          '(propietario/superusuario) para las rutas de login/registro/carga de token.',
      );
    }
    url = process.env.DIRECT_DATABASE_URL;
    // eslint-disable-next-line no-console
    console.warn(
      '[prisma] SYSTEM_DATABASE_URL no definido; usando DIRECT_DATABASE_URL como cliente de sistema ' +
        '(solo dev/CI). En producción declara el rol dedicado legalflow_system.',
    );
  }
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
