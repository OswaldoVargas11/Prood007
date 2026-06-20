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

const BRAND = '#534AB7';

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
 * Envoltura HTML de marca para los correos transaccionales. Diseño table-based con estilos inline para
 * máxima compatibilidad con clientes de correo (Gmail/Outlook). Cabecera con la marca Lawzora, cuerpo,
 * botón "a prueba de balas" y pie. Los `paragraphs` se insertan como HTML (el caller escapa el contenido
 * de usuario); las URLs son enlaces generados por nosotros.
 */
function renderEmail(opts: {
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  note?: string;
}): string {
  // Defensa en profundidad: `heading` y `note` son texto plano → se escapan aquí. Los `paragraphs`
  // mantienen su contrato HTML (los callers ya escapan el contenido de usuario antes de insertarlo).
  const heading = escapeHtml(opts.heading);
  const safeNote = opts.note ? escapeHtml(opts.note) : undefined;
  const para = opts.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${p}</p>`)
    .join('');
  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr>` +
      `<td style="border-radius:8px;background:${BRAND};">` +
      `<a href="${opts.button.url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${opts.button.label}</a>` +
      `</td></tr></table>`
    : '';
  const note = safeNote
    ? `<p style="margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#a1a1aa;">${safeNote}</p>`
    : '';
  return (
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">` +
    `<tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e7;">` +
    `<tr><td style="padding:18px 28px;border-bottom:1px solid #f0f0f1;">` +
    `<span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${BRAND};vertical-align:middle;"></span>` +
    `<span style="font-size:17px;font-weight:bold;color:#18181b;vertical-align:middle;margin-left:8px;">Lawzora</span>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;">` +
    `<h1 style="margin:0 0 16px;font-size:19px;font-weight:bold;color:#18181b;">${heading}</h1>` +
    para +
    button +
    note +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px;border-top:1px solid #f0f0f1;">` +
    `<p style="margin:0;font-size:12px;color:#a1a1aa;">Lawzora · Software de gestión para despachos de abogados</p>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** Plantilla del correo de recuperación de contraseña, reutilizada por todos los providers. */
export function passwordResetMessage(to: string, resetLink: string): MailMessage {
  const subject = 'Restablece tu contraseña';
  const text =
    `Hemos recibido una solicitud para restablecer tu contraseña.\n\n` +
    `Abre este enlace para elegir una nueva (caduca en 1 hora):\n${resetLink}\n\n` +
    `Si no solicitaste el cambio, ignora este mensaje.`;
  const html = renderEmail({
    heading: 'Restablece tu contraseña',
    paragraphs: ['Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.'],
    button: { label: 'Elegir una nueva contraseña', url: resetLink },
    note: 'El enlace caduca en 1 hora. Si no solicitaste el cambio, ignora este mensaje.',
  });
  return { to, subject, html, text };
}

/**
 * Plantilla del correo de BIENVENIDA/INVITACIÓN al crear una cuenta (cliente de portal o personal del
 * despacho). Lleva un enlace de ACTIVACIÓN (reutiliza la página de reset) para que el invitado fije su
 * propia contraseña; al hacerlo se considera además verificado su email.
 */
export function accountInviteMessage(
  to: string,
  opts: { fullName?: string; firmName: string; activationLink: string; portal: boolean },
): MailMessage {
  const name = opts.fullName ? escapeHtml(opts.fullName) : null;
  const firm = escapeHtml(opts.firmName);
  const greeting = name ? `Hola ${name},` : 'Hola,';
  const intro = opts.portal
    ? `<strong>${firm}</strong> te ha dado acceso a su portal de cliente.`
    : `Se ha creado tu cuenta en <strong>${firm}</strong>.`;
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
  const html = renderEmail({
    heading: opts.portal ? 'Acceso a tu portal de cliente' : '¡Bienvenido a Lawzora!',
    paragraphs: [greeting, intro, 'Activa tu cuenta y elige tu propia contraseña para empezar.'],
    button: { label: 'Activar mi cuenta', url: opts.activationLink },
    note: 'El enlace caduca en 7 días. Una vez activada, inicia sesión con tu correo.',
  });
  return { to, subject, html, text };
}

/**
 * Plantilla del correo de VERIFICACIÓN de email (anti-bots). Se envía al auto-registrar un despacho;
 * el usuario debe confirmar antes de poder operar en la web.
 */
export function verificationMessage(
  to: string,
  opts: { fullName?: string; verifyLink: string },
): MailMessage {
  const name = opts.fullName ? escapeHtml(opts.fullName) : null;
  const subject = 'Confirma tu correo electrónico — Lawzora';
  const text =
    `${opts.fullName ? `Hola ${opts.fullName},` : 'Hola,'}\n\n` +
    `Confirma tu correo electrónico para activar tu cuenta de Lawzora (el enlace caduca en 24 horas):\n` +
    `${opts.verifyLink}\n\n` +
    `Si no creaste esta cuenta, ignora este mensaje.`;
  const html = renderEmail({
    heading: 'Confirma tu correo electrónico',
    paragraphs: [
      name ? `Hola ${name},` : 'Hola,',
      'Gracias por crear tu cuenta en Lawzora. Confirma tu correo para empezar a usar la plataforma.',
    ],
    button: { label: 'Confirmar mi correo', url: opts.verifyLink },
    note: 'El enlace caduca en 24 horas. Si no creaste esta cuenta, ignora este mensaje.',
  });
  return { to, subject, html, text };
}

/**
 * Plantilla del correo de RECORDATORIO DE PLAZO/TAREA. Lleva el plazo, el expediente y un botón a la
 * tarea. Se envía además del aviso in-app, para que el abogado se entere aunque no esté en la app.
 */
export function deadlineReminderMessage(
  to: string,
  opts: {
    fullName?: string | null;
    taskTitle: string;
    daysUntilDue: number;
    matterRef?: string | null;
    link: string;
  },
): MailMessage {
  const when =
    opts.daysUntilDue < 0
      ? 'Plazo vencido'
      : opts.daysUntilDue === 0
        ? 'Plazo hoy'
        : opts.daysUntilDue === 1
          ? 'Plazo mañana'
          : `Plazo en ${opts.daysUntilDue} días`;
  const title = escapeHtml(opts.taskTitle);
  const subject = `${when}: ${opts.taskTitle}`;
  const paragraphs = [
    opts.fullName ? `Hola ${escapeHtml(opts.fullName)},` : 'Hola,',
    `Tienes un plazo próximo: <strong>${title}</strong>.`,
  ];
  if (opts.matterRef)
    paragraphs.push(`Expediente: <strong>${escapeHtml(opts.matterRef)}</strong>.`);
  const text =
    `${when}: ${opts.taskTitle}\n` +
    `${opts.matterRef ? `Expediente: ${opts.matterRef}\n` : ''}\n` +
    `Abre la tarea en Lawzora:\n${opts.link}`;
  const html = renderEmail({
    heading: when,
    paragraphs,
    button: { label: 'Ver la tarea', url: opts.link },
    note: 'Recibes este aviso porque tienes un plazo asignado en Lawzora.',
  });
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
