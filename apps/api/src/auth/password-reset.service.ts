import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TokensService } from './tokens.service';
import { HibpService } from './hibp.service';
import { MAIL_PROVIDER, accountInviteMessage, type MailProvider } from './mail/mail.provider';
import { apiError } from '../common/api-messages';
import type { RequestUser } from './auth.types';

const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000; // 24 h (el admin entrega el enlace al usuario)
const FORGOT_RESET_TTL_MS = 60 * 60 * 1000; // 1 h (autoservicio por correo)
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 d (activación de una cuenta nueva por invitación)

/**
 * Recuperación de contraseña — "ambos" caminos (SEC3):
 *   1) Reset por ADMIN del despacho (sin email): genera un enlace de un solo uso que el admin entrega.
 *   2) Autoservicio "olvidé mi contraseña": por correo, detrás de `MailProvider` (stub Noop por
 *      defecto). Respuesta SIEMPRE genérica para no filtrar la existencia de cuentas.
 * El token nunca se guarda en claro (solo su hash). Aplicarlo cierra TODAS las sesiones del usuario.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly hibp: HibpService,
    private readonly config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Crea una fila PasswordReset y devuelve el token EN CLARO (que solo se ve aquí). */
  private async createToken(
    userId: string,
    ttlMs: number,
    createdById?: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.system.passwordReset.create({
      data: { userId, tokenHash: this.sha256(token), expiresAt, createdById },
    });
    return { token, expiresAt };
  }

  private resetLink(token: string): string {
    // URL base del web. UNA sola fuente (APP_PUBLIC_URL, el mismo que usan OAuth/portal/pagos); el
    // fallback apunta a producción para no generar nunca enlaces a localhost si la var faltara.
    const base = this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
    return `${base}/reset-password?token=${token}`;
  }

  /**
   * Reset por admin: genera un enlace de un solo uso para un usuario del MISMO despacho (staff o
   * cliente de portal). Devuelve el enlace/token para mostrarlo UNA vez en la UI. Solo FIRM_ADMIN.
   */
  async adminCreateReset(actor: RequestUser, targetUserId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId: actor.tenantId },
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException(apiError('users.notFound'));

    const { token, expiresAt } = await this.createToken(
      target.id,
      ADMIN_RESET_TTL_MS,
      actor.userId,
    );
    // El usuario destino deberá fijar una contraseña propia al aplicar el reset (SEC4).
    await this.prisma.user.update({
      where: { id: target.id },
      data: { mustChangePassword: true },
    });
    await this.audit.log(actor, 'user.password_reset_issued', 'User', target.id);
    return { token, resetLink: this.resetLink(token), expiresAt, email: target.email };
  }

  /**
   * Envía el correo de BIENVENIDA/INVITACIÓN a una cuenta recién creada por el despacho (cliente de
   * portal o personal): emite un token de ACTIVACIÓN (7 d) y manda el enlace para que el invitado
   * fije su propia contraseña. Reutiliza la página de reset. FAIL-SOFT: un fallo de correo NO rompe el
   * alta de la cuenta (se registra y se sigue). En dev/CI sin SMTP, el provider Noop no envía nada.
   */
  async sendInvite(userId: string, opts: { portal: boolean }): Promise<void> {
    const user = await this.system.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, tenant: { select: { name: true } } },
    });
    if (!user) return;
    try {
      const { token } = await this.createToken(user.id, INVITE_TTL_MS);
      await this.mail.sendMail(
        accountInviteMessage(user.email, {
          fullName: user.fullName,
          firmName: user.tenant.name,
          activationLink: this.resetLink(token),
          portal: opts.portal,
        }),
      );
    } catch (err) {
      this.logger.error('Fallo al enviar el correo de bienvenida/invitación', err as Error);
    }
  }

  /**
   * Autoservicio "olvidé mi contraseña". SIEMPRE resuelve sin revelar si el email existe.
   * Si hay exactamente un usuario activo con ese email, emite token y delega el envío al MailProvider.
   */
  async forgotPassword(email: string): Promise<void> {
    const users = await this.system.user.findMany({
      where: { email: email.toLowerCase(), isActive: true },
      select: { id: true, email: true },
    });
    // Si el email es ambiguo (varios despachos) o no existe, no hacemos nada (respuesta genérica).
    if (users.length !== 1) return;

    const user = users[0]!;
    const { token } = await this.createToken(user.id, FORGOT_RESET_TTL_MS);
    // Fail-soft: un fallo de envío NO debe cambiar la respuesta genérica (no filtrar existencia de
    // cuentas) ni propagar un 500. Se registra para diagnóstico y se resuelve igualmente.
    try {
      await this.mail.sendPasswordReset(user.email, this.resetLink(token));
    } catch (err) {
      this.logger.error('Fallo al enviar el correo de recuperación', err as Error);
    }
  }

  /**
   * Aplica un token de reset: valida (existe, no usado, no expirado), fija la nueva contraseña,
   * marca el token como usado y CIERRA todas las sesiones del usuario.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: true }> {
    const row = await this.system.passwordReset.findUnique({
      where: { tokenHash: this.sha256(token) },
    });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(apiError('auth.resetInvalid'));
    }
    await this.hibp.assertNotBreached(newPassword);

    const passwordHash = await argon2.hash(newPassword);
    await this.system.user.update({
      where: { id: row.userId },
      // Fijar la contraseña propia limpia la obligación de cambio (SEC4).
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });
    await this.system.passwordReset.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(row.userId);
    // El flujo público no tiene contexto de tenant (AuditLog está bajo RLS), así que la auditoría
    // explícita se omite aquí; `passwordChangedAt` queda como señal durable del cambio.
    return { success: true };
  }
}
