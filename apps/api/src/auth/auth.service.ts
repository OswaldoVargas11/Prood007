import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Currency, Jurisdiction, Role, featuresForPlan, type Feature } from '@legalflow/domain';
import { SystemPrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokensService } from './tokens.service';
import { HibpService } from './hibp.service';
import { MfaService } from './mfa.service';
import { EmailVerificationService } from './email-verification.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PERMISSION_NAMES, PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS } from './rbac/permissions';
import { apiError } from '../common/api-messages';
import { TRIAL_DAYS } from '../subscription/plans';
import type { RequestUser, TokenPair } from './auth.types';

/** Respuesta de login cuando el usuario tiene MFA: no hay sesión todavía, hay que aportar el código. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

// Lockout por cuenta (SEC4): umbral de fallos consecutivos y duración del bloqueo.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min

// Hash argon2 fijo (de una cadena aleatoria descartada) para la verificación señuelo anti-enumeración
// por temporización: cuando el email no existe, igualamos el coste de cómputo del caso normal.
const DECOY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$aPRtfBnmDSUUwFbcIVqdvg$Ymd/6Kie5vSDC9CHWLN4JS9V6FVohRIPEmaPut7C+/w';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // `system`: cliente BYPASSRLS. Login y registro son rutas cross-tenant SIN contexto de tenant;
  // con RLS en fail-closed deben pasar por el rol de sistema, no por ausencia de contexto (D-020).
  constructor(
    private readonly system: SystemPrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly hibp: HibpService,
    private readonly mfa: MfaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  private hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  /**
   * Registra un despacho (tenant), siembra el RBAC base y crea el primer usuario FIRM_ADMIN.
   * Devuelve un par de tokens (auto-login). Todo en una transacción.
   */
  async registerTenant(dto: RegisterTenantDto): Promise<{ tenantId: string; tokens: TokenPair }> {
    await this.hibp.assertNotBreached(dto.admin.password);
    const passwordHash = await this.hashPassword(dto.admin.password);

    const result = await this.system.$transaction(async (tx) => {
      // 1) Asegurar catálogo de permisos global (idempotente y SEGURO ante concurrencia).
      //    createMany + skipDuplicates compila a INSERT ... ON CONFLICT DO NOTHING, atómico:
      //    evita la "Unique constraint failed on (code)" cuando dos despachos se registran a la vez.
      await tx.permission.createMany({
        data: PERMISSIONS.map((code) => ({ code, name: PERMISSION_NAMES[code] })),
        skipDuplicates: true,
      });
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...PERMISSIONS] } },
      });
      const permByCode = new Map(permissions.map((p) => [p.code, p.id]));

      // 2) Crear el tenant.
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          taxId: dto.taxId,
          jurisdiction: dto.jurisdiction as unknown as Jurisdiction,
          currency: dto.currency as unknown as Currency,
          // Un solo idioma de UI (`es`); la jurisdicción gobierna la terminología fiscal, no el locale.
          locale: 'es',
          // Prueba gratis de 15 días con TODO abierto. Al expirar sin suscripción → muro. Las plazas
          // (maxAdmins/maxLawyers) y `seats` quedan en su default; se fijan al suscribirse (Stripe).
          subscriptionStatus: 'TRIALING',
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
      });

      // 3) Crear los roles base del tenant con sus permisos.
      const roleIdByCode = new Map<Role, string>();
      for (const roleCode of [Role.FIRM_ADMIN, Role.LAWYER, Role.CLIENT]) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            code: roleCode,
            name: ROLE_NAMES[roleCode],
            permissions: {
              create: ROLE_PERMISSIONS[roleCode]
                .map((code) => permByCode.get(code))
                .filter((id): id is string => Boolean(id))
                .map((permissionId) => ({ permissionId })),
            },
          },
        });
        roleIdByCode.set(roleCode, role.id);
      }

      // 4) Crear el usuario admin y asignarle FIRM_ADMIN.
      const adminRoleId = roleIdByCode.get(Role.FIRM_ADMIN)!;
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.admin.email.toLowerCase(),
          passwordHash,
          fullName: dto.admin.fullName,
          roles: { create: [{ roleId: adminRoleId }] },
        },
      });

      return { tenant, userId: user.id };
    });

    // Anti-bots: el admin recién registrado nace sin verificar; se le envía el correo de confirmación
    // (fail-soft) y el front lo bloquea hasta confirmar. Sesión emitida igualmente (para poder reenviar).
    await this.emailVerification.sendFor(result.userId);
    const userForToken = await this.tokens.loadUserForToken(result.userId);
    const tokens = await this.tokens.issuePair(userForToken);
    return { tenantId: result.tenant.id, tokens };
  }

  /**
   * Login con email+password. tenantId solo es necesario si el email existe en varios tenants.
   *
   * SEC4 — añade lockout por cuenta y auditoría de login:
   *  - bloqueo: si `lockedUntil` está en el futuro → 401 `auth.accountLocked`; a los
   *    `MAX_FAILED_ATTEMPTS` fallos consecutivos se fija `lockedUntil = now + 15min`;
   *  - auditoría: registra éxito/fallo de usuarios conocidos vía `SystemPrismaService` (la RLS de
   *    AuditLog haría fallar el insert por el rol app en una ruta sin contexto de tenant);
   *  - para email inexistente no se inserta AuditLog (solo log de servidor) para no crear ruido ni
   *    filtrar existencia de cuentas.
   */
  async login(dto: LoginDto): Promise<TokenPair | MfaChallenge> {
    const email = dto.email.toLowerCase();
    const candidates = await this.system.user.findMany({
      where: { email, ...(dto.tenantId ? { tenantId: dto.tenantId } : {}) },
    });

    if (candidates.length === 0) {
      // Verificación señuelo contra un hash fijo: iguala el tiempo de respuesta con el caso "usuario
      // existe + contraseña mala" (que sí ejecuta argon2), evitando enumeración de cuentas por timing.
      await argon2.verify(DECOY_PASSWORD_HASH, dto.password).catch(() => false);
      // Mismo error que credenciales inválidas para no filtrar existencia de cuentas.
      this.logger.warn(`Login fallido: email desconocido (${email}).`);
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    }

    // Caso normal: un único candidato (email único, o tenantId explícito). Flujo con lockout completo.
    if (candidates.length === 1) {
      const user = candidates[0]!;
      await this.verifyOrFail(user, dto.password);
      if (user.mfaEnabled) return this.mfaChallenge(user.id);
      return this.issueForUser(user);
    }

    // El email existe en VARIOS despachos y no se indicó tenantId. En lugar de exigirlo a ciegas
    // (el cliente de portal no lo conoce), RESOLVEMOS por contraseña: probamos las cuentas activas y
    //  - 1 coincide  → entramos a ese despacho;
    //  - 0 coinciden → credenciales inválidas;
    //  - >1 coinciden (misma contraseña en varios) → devolvemos la lista para que ELIJA el despacho.
    const matches: typeof candidates = [];
    const failed: typeof candidates = [];
    for (const c of candidates) {
      if (!c.isActive) continue;
      if (c.lockedUntil && c.lockedUntil.getTime() > Date.now()) continue;
      if (await argon2.verify(c.passwordHash, dto.password)) {
        matches.push(c);
      } else {
        failed.push(c);
      }
    }

    if (matches.length === 0) {
      // D2-006: el flujo multi-despacho también debe contabilizar fallos y bloquear (igual que
      // `verifyOrFail`); sin esto, un atacante con una contraseña a probar podía martillar las cuentas
      // (mismo email en varios despachos) sin tope alguno. OJO: solo contamos el fallo cuando NINGÚN
      // candidato coincidió. Si uno coincide, los demás "fallos" son benignos (la contraseña pertenece a
      // otro despacho) y NO deben penalizar a las cuentas hermanas de un usuario multi-despacho legítimo.
      for (const c of failed) await this.registerFailedAttempt(c);
      this.logger.warn(`Login fallido: sin coincidencia entre despachos (${email}).`);
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    }
    if (matches.length === 1) {
      const u = matches[0]!;
      if (u.mfaEnabled) return this.mfaChallenge(u.id);
      return this.issueForUser(u);
    }

    // Ambigüedad real: misma contraseña en varios despachos. Pedimos elegir (payload con opciones).
    const tenants = await this.system.tenant.findMany({
      where: { id: { in: matches.map((m) => m.tenantId) } },
      select: { id: true, name: true },
    });
    throw new ConflictException({
      message: apiError('auth.chooseTenant'),
      code: 'auth.chooseTenant',
      choices: tenants.map((t) => ({ tenantId: t.id, tenantName: t.name })),
    });
  }

  /** Construye el desafío MFA (token corto que el cliente devuelve junto al código). */
  private async mfaChallenge(userId: string): Promise<MfaChallenge> {
    return { mfaRequired: true, mfaToken: await this.tokens.signMfaChallenge(userId) };
  }

  /** Segundo paso del login con MFA: valida el desafío + el código (TOTP o de respaldo) y emite sesión. */
  async mfaLogin(mfaToken: string, code: string): Promise<TokenPair> {
    const { userId, jti } = await this.tokens.verifyMfaChallenge(mfaToken);
    const user = await this.system.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive)
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    // El segundo factor comparte el lockout de la contraseña: sin esto, un atacante con la contraseña
    // filtrada puede martillar el TOTP de 6 dígitos durante la vida del reto sin freno por cuenta. Si la
    // cuenta ya está bloqueada (por fallos de password o de MFA), no se permite ni con el código correcto.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.auditLogin(user.tenantId, user.id, false, 'locked');
      throw new UnauthorizedException(apiError('auth.accountLocked'));
    }
    const ok = await this.mfa.verifyForLogin(userId, code);
    if (!ok) {
      // D2-005: incremento ATÓMICO (evita el TOCTOU del snapshot: dos intentos MFA concurrentes con el
      // valor leído una sola vez perdían cuentas). Leemos el valor YA incrementado del propio UPDATE y
      // sobre él decidimos el bloqueo; si toca, un segundo UPDATE fija `lockedUntil` y resetea contador.
      const updated = await this.system.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      const locks = updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
      if (locks) {
        await this.system.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
        });
      }
      await this.auditLogin(user.tenantId, user.id, false, locks ? 'mfa_locked_now' : 'mfa_failed');
      throw new UnauthorizedException(apiError('mfa.invalidCode'));
    }
    // D2-004: reto MFA de un solo uso. Se consume SOLO tras un código válido, de modo que un código
    // erróneo no invalida el reto (el usuario puede reintentar) pero un reto ya canjeado no se reutiliza.
    this.tokens.consumeMfaJti(jti);
    return this.issueForUser(user);
  }

  /**
   * Verifica credenciales de un usuario concreto aplicando el lockout (SEC4): cuenta desactivada,
   * bloqueo activo, y contador de fallos con bloqueo a los `MAX_FAILED_ATTEMPTS`. Lanza en caso de
   * fallo (y audita). En éxito no toca contadores: de eso se encarga `issueForUser`.
   */
  private async verifyOrFail(
    user: {
      id: string;
      tenantId: string;
      isActive: boolean;
      lockedUntil: Date | null;
      failedLoginAttempts: number;
      passwordHash: string;
    },
    password: string,
  ): Promise<void> {
    if (!user.isActive) {
      throw new UnauthorizedException(apiError('auth.accountDisabled'));
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.auditLogin(user.tenantId, user.id, false, 'locked');
      throw new UnauthorizedException(apiError('auth.accountLocked'));
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    }
  }

  /**
   * Contabiliza un fallo de contraseña en una cuenta concreta: incrementa `failedLoginAttempts` y, al
   * llegar a `MAX_FAILED_ATTEMPTS`, fija `lockedUntil` (y resetea el contador). Audita el fallo. Lo usan
   * tanto `verifyOrFail` (candidato único) como el flujo multi-despacho (D2-006), para que el bloqueo
   * por cuenta sea uniforme. Lee el contador del propio registro (el caller carga datos frescos).
   */
  private async registerFailedAttempt(user: {
    id: string;
    tenantId: string;
    failedLoginAttempts: number;
  }): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const locks = attempts >= MAX_FAILED_ATTEMPTS;
    await this.system.user.update({
      where: { id: user.id },
      data: locks
        ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
        : { failedLoginAttempts: attempts },
    });
    await this.auditLogin(user.tenantId, user.id, false, locks ? 'locked_now' : 'bad_password');
  }

  /** Perfil del usuario autenticado + su despacho (id, nombre, moneda) para el header y los informes. */
  async getProfile(user: RequestUser): Promise<
    RequestUser & {
      tenant: {
        id: string;
        name: string;
        currency: string;
        plan: string;
        subscriptionStatus: string;
        entitlements: Record<Feature, boolean>;
      };
    }
  > {
    const tenant = await this.system.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, name: true, currency: true, plan: true, subscriptionStatus: true },
    });
    // Entitlements por tier (función→bool). Legacy/prueba → todo true (grandfathering).
    const entitlements = featuresForPlan(tenant?.plan);
    return {
      ...user,
      tenant: tenant
        ? { ...tenant, entitlements }
        : {
            id: user.tenantId,
            name: '',
            currency: 'EUR',
            plan: 'PROFESIONAL',
            subscriptionStatus: 'TRIALING',
            entitlements,
          },
    };
  }

  /** Login correcto: resetea contador/bloqueo, audita y emite el par de tokens. */
  private async issueForUser(user: {
    id: string;
    tenantId: string;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
  }): Promise<TokenPair> {
    if (user.failedLoginAttempts !== 0 || user.lockedUntil) {
      await this.system.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }
    await this.auditLogin(user.tenantId, user.id, true);
    const userForToken = await this.tokens.loadUserForToken(user.id);
    return this.tokens.issuePair(userForToken);
  }

  /**
   * Auditoría de eventos de login para usuarios conocidos (tenemos su tenantId). Se inserta vía el
   * cliente de sistema (BYPASSRLS) porque login es cross-tenant y la tabla AuditLog tiene RLS
   * fail-closed: un insert por el rol app sin contexto de tenant fallaría por WITH CHECK.
   */
  private async auditLogin(
    tenantId: string,
    userId: string,
    success: boolean,
    reason?: string,
  ): Promise<void> {
    try {
      await this.system.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: success ? 'auth.login_success' : 'auth.login_failed',
          entityType: 'User',
          entityId: userId,
          metadata: reason ? { reason } : undefined,
        },
      });
    } catch (err) {
      // La auditoría nunca debe romper el login.
      this.logger.error('No se pudo registrar auditoría de login', err as Error);
    }
  }

  /**
   * Cambio de contraseña self-service (cualquier usuario autenticado: staff o cliente de portal).
   * Re-autentica con la contraseña actual, aplica la nueva, sella `passwordChangedAt`, REVOCA todas
   * las sesiones del usuario y emite un par nuevo para el dispositivo actual. Resultado: el resto de
   * dispositivos pierden el refresh (y el access caduca en ≤15 min). Registra auditoría.
   */
  async changePassword(actor: RequestUser, dto: ChangePasswordDto): Promise<TokenPair> {
    const user = await this.system.user.findUnique({ where: { id: actor.userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(apiError('auth.invalidUser'));
    }

    const currentOk = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentOk) {
      throw new UnauthorizedException(apiError('auth.currentPasswordInvalid'));
    }
    // Evita el "cambio" que no cambia nada (y fuerza una rotación real de credencial).
    if (await argon2.verify(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException(apiError('auth.passwordSameAsOld'));
    }
    await this.hibp.assertNotBreached(dto.newPassword);

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.system.user.update({
      where: { id: user.id },
      // El cambio self-service limpia la obligación de cambio (SEC4).
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });

    // Cierra el resto de sesiones; emite un par nuevo para que el dispositivo actual siga dentro.
    await this.tokens.revokeAllForUser(user.id);
    const userForToken = await this.tokens.loadUserForToken(user.id);
    const tokens = await this.tokens.issuePair(userForToken);

    await this.audit.log(actor, 'user.password_changed', 'User', user.id);
    return tokens;
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }
}
