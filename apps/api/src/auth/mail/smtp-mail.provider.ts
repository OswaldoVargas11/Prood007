import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { MailMessage, MailProvider, passwordResetMessage } from './mail.provider';

/**
 * Proveedor de correo por SMTP (nodemailer). Se selecciona en `auth.module` solo cuando `SMTP_HOST`
 * está definido; en dev/CI sin SMTP se usa `NoopMailProvider`, de modo que nada exige un servidor real.
 *
 * El transporte se crea de forma PEREZOSA en el primer envío (no en el arranque) y nodemailer no abre
 * conexión hasta que se manda el primer correo, así el boot y los e2e no se bloquean.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger(SmtpMailProvider.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {}

  private get from(): string {
    return this.config.get<string>('MAIL_FROM') ?? 'no-reply@legalflow.local';
  }

  /** Crea (una sola vez) el transporte SMTP. La importación de nodemailer es perezosa. */
  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;
    // Import perezoso: no carga nodemailer hasta el primer envío real.
    const nodemailer = await import('nodemailer');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port,
      // 465 → TLS implícito; el resto (587/25) negocian STARTTLS.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.transporter;
  }

  async sendMail(message: MailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? message.subject,
    });
    this.logger.debug(`[mail:smtp] enviado a ${message.to} · «${message.subject}»`);
  }

  async sendPasswordReset(to: string, resetLink: string): Promise<void> {
    await this.sendMail(passwordResetMessage(to, resetLink));
  }
}
