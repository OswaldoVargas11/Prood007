import { Injectable, Logger } from '@nestjs/common';

/** Token de inyección del proveedor de correo (permite sustituir el stub por SMTP/Resend). */
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/** Mensaje de correo transaccional genérico. `text` es opcional (se deriva del asunto si falta). */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Contrato de envío de correo transaccional. `sendMail` es el primitivo genérico; los métodos de
 * conveniencia (p. ej. `sendPasswordReset`) construyen el cuerpo i18n y delegan en él. Así un nuevo
 * tipo de correo solo añade un helper sin tocar a los proveedores concretos.
 */
export interface MailProvider {
  /** Envía un correo arbitrario. Los proveedores deben ser fail-soft a criterio del caller. */
  sendMail(message: MailMessage): Promise<void>;
  /** Envía al usuario el enlace de restablecimiento de contraseña. */
  sendPasswordReset(to: string, resetLink: string): Promise<void>;
}

/** Plantilla simple (es) del correo de recuperación de contraseña, reutilizada por todos los providers. */
export function passwordResetMessage(to: string, resetLink: string): MailMessage {
  const subject = 'Restablece tu contraseña';
  const text =
    `Hemos recibido una solicitud para restablecer tu contraseña.\n\n` +
    `Abre este enlace para elegir una nueva (caduca en 1 hora):\n${resetLink}\n\n` +
    `Si no solicitaste el cambio, ignora este mensaje.`;
  const html =
    `<p>Hemos recibido una solicitud para restablecer tu contraseña.</p>` +
    `<p><a href="${resetLink}">Elegir una nueva contraseña</a> (el enlace caduca en 1 hora).</p>` +
    `<p>Si no solicitaste el cambio, ignora este mensaje.</p>`;
  return { to, subject, html, text };
}

/** Escapa texto del despacho/usuario para insertarlo de forma segura en el HTML del correo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Plantilla (es) del correo de BIENVENIDA/INVITACIÓN al crear una cuenta (cliente de portal o
 * personal del despacho). Lleva un enlace de ACTIVACIÓN (reutiliza la página de reset) para que el
 * invitado fije su propia contraseña, de modo que el despacho no tenga que comunicarla a mano.
 */
export function accountInviteMessage(
  to: string,
  opts: { fullName?: string; firmName: string; activationLink: string; portal: boolean },
): MailMessage {
  const greeting = opts.fullName ? `Hola ${escapeHtml(opts.fullName)},` : 'Hola,';
  const firm = escapeHtml(opts.firmName);
  const intro = opts.portal
    ? `${firm} te ha dado acceso a su portal de cliente.`
    : `Se ha creado tu cuenta en ${firm}.`;
  const subject = opts.portal
    ? `Acceso a tu portal de cliente — ${opts.firmName}`
    : `Tu cuenta en ${opts.firmName}`;
  const text =
    `${opts.fullName ? `Hola ${opts.fullName},` : 'Hola,'}\n\n` +
    `${
      opts.portal
        ? `${opts.firmName} te ha dado acceso a su portal de cliente.`
        : `Se ha creado tu cuenta en ${opts.firmName}.`
    }\n\n` +
    `Activa tu cuenta y elige tu contraseña (el enlace caduca en 7 días):\n${opts.activationLink}\n\n` +
    `Una vez activada, inicia sesión con tu email.`;
  const html =
    `<p>${greeting}</p>` +
    `<p>${intro}</p>` +
    `<p><a href="${opts.activationLink}">Activar mi cuenta y elegir contraseña</a> ` +
    `(el enlace caduca en 7 días).</p>` +
    `<p>Una vez activada, inicia sesión con tu email.</p>`;
  return { to, subject, html, text };
}

/**
 * Implementación por defecto: NO envía correo. Registra la intención para trazabilidad en dev/CI.
 * Para activar email real, regístrese `SmtpMailProvider` bajo el token MAIL_PROVIDER (ver auth.module).
 */
@Injectable()
export class NoopMailProvider implements MailProvider {
  private readonly logger = new Logger(NoopMailProvider.name);

  sendMail(message: MailMessage): Promise<void> {
    this.logger.debug(`[mail:noop] correo para ${message.to} · asunto «${message.subject}»`);
    return Promise.resolve();
  }

  sendPasswordReset(to: string, resetLink: string): Promise<void> {
    // No se registra el token en claro en producción salvo nivel debug; el enlace lleva el secreto.
    this.logger.debug(`[mail:noop] reset de contraseña para ${to} → ${resetLink}`);
    return Promise.resolve();
  }
}
