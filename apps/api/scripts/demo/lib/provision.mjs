/**
 * Aprovisionamiento de un despacho DEMO vía Prisma (rol privilegiado), REPLICANDO lo que hace
 * `AuthService.registerTenant` (catálogo de permisos global + 3 roles base + usuario admin), más:
 *   · plan = 'AVANZADO' y subscriptionStatus = 'ACTIVE' → DESBLOQUEA todas las funciones (data room,
 *     closing, hoja de encargo, secretaría, IA…) y evita el muro de prueba en la demo. (Ver
 *     `planEffectiveTier`/`hasAppAccess`.)
 *   · admin con emailVerified = true → entra a la demo sin pasar por el correo de confirmación.
 *   · un par de letrados extra como responsables/asignatarios para que la actividad tenga autores.
 *   · reglas de dunning por defecto (cosmético: la pantalla de cobros no sale vacía).
 *
 * NO crea suscripción real de Stripe ni toca defaults fiscales. `tenantId` explícito en cada fila.
 */
import argon2 from 'argon2';
import { DEMO_NAME_SUFFIX, DEMO_PASSWORD, daysFromNow } from './env.mjs';

// Catálogo de permisos (espejo de apps/api/src/auth/rbac/permissions.ts). createMany+skipDuplicates
// es idempotente y seguro ante concurrencia (INSERT … ON CONFLICT DO NOTHING).
const PERMISSIONS = [
  ['tenant:manage', 'Gestionar el despacho'],
  ['user:manage', 'Gestionar usuarios'],
  ['client:read', 'Ver clientes'],
  ['client:write', 'Editar clientes'],
  ['matter:read', 'Ver expedientes'],
  ['matter:write', 'Editar expedientes'],
  ['document:read', 'Ver documentos'],
  ['document:write', 'Editar documentos'],
  ['document:approve', 'Aprobar/rechazar documentos'],
  ['task:read', 'Ver tareas'],
  ['task:write', 'Editar tareas'],
  ['invoice:read', 'Ver facturas'],
  ['invoice:write', 'Emitir facturas'],
  ['ledger:read', 'Ver el ledger'],
];
const ALL = PERMISSIONS.map(([c]) => c);
const LAWYER_PERMS = ALL.filter((c) => c !== 'tenant:manage' && c !== 'user:manage');
const CLIENT_PERMS = ['matter:read', 'document:read', 'invoice:read', 'ledger:read'];
const ROLES = [
  { code: 'FIRM_ADMIN', name: 'Administrador del despacho', perms: ALL },
  { code: 'LAWYER', name: 'Abogado', perms: LAWYER_PERMS },
  { code: 'CLIENT', name: 'Cliente', perms: CLIENT_PERMS },
];

/**
 * Crea el despacho demo y su plantilla mínima (admin + 2 letrados).
 * @returns {Promise<{ tenant: object, admin: object, lawyers: object[] }>}
 */
export async function provisionTenant(prisma, cfg) {
  // 1) Catálogo de permisos global (idempotente).
  await prisma.permission.createMany({
    data: PERMISSIONS.map(([code, name]) => ({ code, name })),
    skipDuplicates: true,
  });
  const perms = await prisma.permission.findMany({ where: { code: { in: ALL } } });
  const permId = new Map(perms.map((p) => [p.code, p.id]));

  // 2) Despacho (con plan que desbloquea todo + suscripción activa, sin Stripe real).
  const tenant = await prisma.tenant.create({
    data: {
      name: cfg.name + DEMO_NAME_SUFFIX,
      taxId: cfg.taxId,
      jurisdiction: cfg.jurisdiction,
      currency: cfg.currency,
      locale: 'es',
      plan: 'AVANZADO',
      subscriptionStatus: 'ACTIVE',
      seats: 5,
      maxAdmins: 2,
      maxLawyers: 8,
      trialEndsAt: null,
      currentPeriodEnd: daysFromNow(365),
      billingCycle: 'ANNUAL',
      invoiceSeries: cfg.invoiceSeries ?? 'FAC',
      holidays: cfg.holidays ?? undefined,
    },
  });

  // 3) Roles base con sus permisos.
  const roleIdByCode = new Map();
  for (const r of ROLES) {
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        code: r.code,
        name: r.name,
        permissions: { create: r.perms.map((c) => ({ permissionId: permId.get(c) })) },
      },
    });
    roleIdByCode.set(r.code, role.id);
  }

  // 4) Usuarios: admin + letrados. Password común (argon2id, defaults como la API).
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: cfg.adminEmail,
      passwordHash,
      fullName: cfg.adminName,
      isActive: true,
      emailVerified: true,
      billRate: cfg.adminRate ?? '180.00',
      costRate: '70.00',
      roles: { create: [{ roleId: roleIdByCode.get('FIRM_ADMIN') }] },
    },
  });

  const lawyers = [];
  for (let i = 0; i < (cfg.lawyers?.length ?? 0); i++) {
    const l = cfg.lawyers[i];
    const u = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: l.email,
        passwordHash,
        fullName: l.fullName,
        isActive: true,
        emailVerified: true,
        billRate: l.billRate ?? '140.00',
        costRate: l.costRate ?? '55.00',
        roles: { create: [{ roleId: roleIdByCode.get('LAWYER') }] },
      },
    });
    lawyers.push(u);
  }

  // 5) Reglas de dunning por defecto (cosmético; alimenta los recordatorios de las vencidas).
  await prisma.dunningRule.createMany({
    data: [
      { tenantId: tenant.id, offsetDays: 1, severity: 'REMINDER' },
      { tenantId: tenant.id, offsetDays: 7, severity: 'WARNING' },
      { tenantId: tenant.id, offsetDays: 15, severity: 'FINAL' },
    ],
    skipDuplicates: true,
  });

  return { tenant, admin, lawyers };
}
