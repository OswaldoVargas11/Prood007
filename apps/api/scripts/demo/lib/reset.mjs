/**
 * Borrado idempotente de despachos DEMO. SEGURO: solo toca tenants cuyo admin tiene un email del
 * dominio reservado `@demo.legalflow.invalid` (ningún despacho real lo usa). Borra el Tenant en
 * cascada (Prisma `onDelete: Cascade` arrastra usuarios, expedientes, facturas, data rooms, etc.) y
 * purga sus objetos del almacenamiento por prefijo `${tenantId}/`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ put:Function, purgePrefix:Function }} storage
 * @param {string[]} emails  Emails de admin a borrar. Cada uno DEBE pertenecer al dominio demo.
 * @returns {Promise<string[]>} ids de los tenants borrados.
 */
import { DEMO_EMAIL_DOMAIN } from './env.mjs';

export async function wipeDemoTenants(prisma, storage, emails) {
  const safe = emails.filter((e) => e.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN));
  if (safe.length !== emails.length) {
    throw new Error(
      `Negativa de seguridad: solo se pueden borrar emails del dominio demo (${DEMO_EMAIL_DOMAIN}).`,
    );
  }
  const users = await prisma.user.findMany({
    where: { email: { in: safe } },
    select: { tenantId: true },
  });
  const tenantIds = [...new Set(users.map((u) => u.tenantId))];
  for (const id of tenantIds) {
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
    await storage.purgePrefix(`${id}/`);
  }
  return tenantIds;
}
