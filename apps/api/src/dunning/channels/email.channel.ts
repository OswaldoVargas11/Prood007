import { Inject, Injectable, Logger } from '@nestjs/common';
import { DunningChannel, DunningSeverity } from '@legalflow/domain';
import {
  MAIL_PROVIDER,
  escapeHtml,
  renderEmail,
  type MailProvider,
} from '../../auth/mail/mail.provider';
import { DunningChannelDispatcher, DunningDeliveryInput } from './dunning-channel';

/** Asunto del correo según la severidad del escalado (es). */
const SEVERITY_SUBJECT: Record<DunningSeverity, string> = {
  [DunningSeverity.REMINDER]: 'Recordatorio de pago',
  [DunningSeverity.WARNING]: 'Factura vencida',
  [DunningSeverity.FINAL]: 'Aviso final de factura vencida',
};

/**
 * Canal EMAIL del dunning: envía el recordatorio de impago al CLIENTE por correo. Coexiste con el
 * canal IN_APP (no lo sustituye). Solo actúa si el cliente tiene email; si no, omite con gracia.
 * El envío real depende del `MailProvider` activo (SMTP si `SMTP_HOST`, Noop en dev/CI).
 */
@Injectable()
export class EmailChannel implements DunningChannelDispatcher {
  readonly channel = DunningChannel.EMAIL;
  private readonly logger = new Logger(EmailChannel.name);

  constructor(@Inject(MAIL_PROVIDER) private readonly mail: MailProvider) {}

  /** Habilitado como punto de integración; el envío concreto es fail-soft y omite si no hay email. */
  isEnabled(): boolean {
    return true;
  }

  async deliver(input: DunningDeliveryInput): Promise<void> {
    const to = input.client.email?.trim();
    if (!to) {
      // Sin email del cliente no hay nada que enviar: se omite sin romper el barrido.
      this.logger.debug(
        `[dunning:email] cliente ${input.client.id} sin email; se omite la factura ${input.invoice.number}.`,
      );
      return;
    }

    const subject = `${SEVERITY_SUBJECT[input.severity]}: factura ${input.invoice.number}`;
    const amount = `${input.invoice.total} ${input.invoice.currency}`;
    const text =
      `Estimado/a ${input.client.name}:\n\n` +
      `Le recordamos que la factura ${input.invoice.number} por ${amount} se encuentra vencida.\n` +
      `Le agradeceríamos regularizar el pago a la mayor brevedad.\n\n` +
      `Si ya ha realizado el pago, por favor ignore este mensaje.`;
    // M-5 (CWE-79): el nombre del cliente puede venir del intake PÚBLICO (sin allowlist de caracteres),
    // así que se escapa antes de insertarlo en el HTML. El nº de factura y el importe son server-side.
    // Se usa la plantilla de marca `renderEmail` como el resto de correos (antes era HTML a mano).
    const name = escapeHtml(input.client.name);
    const invoiceNumber = escapeHtml(input.invoice.number);
    const safeAmount = escapeHtml(amount);
    const html = renderEmail({
      heading: SEVERITY_SUBJECT[input.severity],
      paragraphs: [
        `Estimado/a ${name}:`,
        `Le recordamos que la factura <strong>${invoiceNumber}</strong> por ` +
          `<strong>${safeAmount}</strong> se encuentra vencida.`,
        'Le agradeceríamos regularizar el pago a la mayor brevedad.',
      ],
      note: 'Si ya ha realizado el pago, por favor ignore este mensaje.',
    });

    await this.mail.sendMail({ to, subject, html, text });
  }
}
