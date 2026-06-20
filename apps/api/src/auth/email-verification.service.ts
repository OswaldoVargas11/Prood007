import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemPrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { MAIL_PROVIDER, type MailProvider, verificationMessage } from './mail/mail.provider';
import type { RequestUser } from './auth.types';

/**
 * Verificación de email (anti-bots). El token es un JWT corto (24 h); confirmar marca `emailVerified`.
 * El auto-registro (registerTenant) nace sin verificar y queda bloqueado por el front hasta confirmar;
 * los invitados se verifican al activar su cuenta por el enlace (ver `resetPassword`).
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly system: SystemPrismaService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  private base(): string {
    return this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
  }

  /** Envía (fail-soft) el correo de verificación a un usuario por su id, si aún no está verificado. */
  async sendFor(userId: string): Promise<void> {
    const user = await this.system.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true, emailVerified: true },
    });
    if (!user || user.emailVerified) return;
    const token = await this.tokens.signEmailVerify(userId);
    const verifyLink = `${this.base()}/verify-email?token=${token}`;
    try {
      await this.mail.sendMail(
        verificationMessage(user.email, { fullName: user.fullName, verifyLink }),
      );
    } catch (err) {
      this.logger.error('Fallo al enviar el correo de verificación', err as Error);
    }
  }

  /** Confirma el email a partir del token. Idempotente. */
  async verify(token: string): Promise<{ success: true }> {
    const userId = await this.tokens.verifyEmailToken(token);
    await this.system.user.update({ where: { id: userId }, data: { emailVerified: true } });
    return { success: true };
  }

  /** Reenvía la verificación al usuario autenticado (si aún no está verificado). */
  async resend(user: RequestUser): Promise<{ success: true }> {
    await this.sendFor(user.userId);
    return { success: true };
  }
}
