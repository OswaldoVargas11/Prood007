import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Contexto de tenant por request (AsyncLocalStorage).
 *
 * El interceptor lo rellena con el tenant del usuario autenticado; la extensión de Prisma
 * (prisma.service.ts) lo lee para fijar `app.tenant_id` en la conexión y que las políticas RLS se
 * apliquen. Sin contexto (rutas de sistema: login, registro, refresh, WebSocket) las queries van en
 * "modo bypass" — las políticas lo permiten intencionadamente (ver migración enable_rls / D-013).
 */
export interface TenantStore {
  tenantId?: string;
  /** true mientras se ejecuta dentro de una `tenantTransaction` (el GUC ya está fijado en la tx). */
  inTenantTx?: boolean;
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/** Ejecuta `fn` con el tenant indicado en el contexto (lo usa el interceptor). */
export function runWithTenant<T>(tenantId: string | undefined, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn);
}

/** Tenant efectivo del contexto actual, si lo hay. */
export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}

/**
 * Abre una transacción que fija el GUC `app.tenant_id` UNA sola vez al inicio, para flujos con
 * varias sentencias (creaciones compuestas, paginación con findMany+count, etc.). Dentro, las
 * operaciones NO se vuelven a envolver (marca `inTenantTx`), evitando transacciones anidadas.
 *
 * Si no hay tenant en contexto (ruta de sistema), simplemente abre la transacción sin GUC → bypass.
 */
export function tenantTransaction<R>(
  // `this.prisma` (PrismaService extends PrismaClient) es asignable a PrismaClient; R se infiere de fn.
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<R>,
): Promise<R> {
  const ctx = tenantStorage.getStore();
  return prisma.$transaction(async (tx) => {
    if (ctx?.tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`;
    }
    return tenantStorage.run({ tenantId: ctx?.tenantId, inTenantTx: true }, () => fn(tx));
  });
}
