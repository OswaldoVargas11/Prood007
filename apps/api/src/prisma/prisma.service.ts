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
 * Fallback a `DIRECT_DATABASE_URL` (rol propietario, superusuario en dev/CI → también bypassa RLS)
 * si `SYSTEM_DATABASE_URL` no está definido, para no romper entornos que aún no lo declaran.
 */
export class SystemPrismaService extends PrismaClient {}

export function createSystemPrisma() {
  const url = process.env.SYSTEM_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}
