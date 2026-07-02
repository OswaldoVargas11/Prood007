import { DunningSeverity } from '@legalflow/domain';
import { EmailChannel } from './email.channel';

const INPUT = {
  tenantId: 't1',
  invoice: { id: 'inv1', number: 'FAC-0001', total: '100', currency: 'EUR', dueDate: new Date() },
  client: { id: 'c1', name: 'Cliente <Uno>', email: 'cliente@example.test' },
  severity: DunningSeverity.WARNING,
  offsetDays: 7,
};

function makeChannel(env: Record<string, string | undefined> = {}) {
  const sendMail = jest.fn().mockResolvedValue(undefined);
  const config = { get: (key: string) => env[key] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = new EmailChannel({ sendMail } as any, config as any);
  return { channel, sendMail };
}

describe('EmailChannel', () => {
  it('isEnabled() refleja si hay SMTP_HOST configurado (proxy de credenciales Brevo/SMTP)', () => {
    expect(makeChannel({ SMTP_HOST: 'smtp.brevo.com' }).channel.isEnabled()).toBe(true);
    expect(makeChannel({}).channel.isEnabled()).toBe(false);
  });

  it('envía el correo al cliente con asunto, enlace al portal y HTML escapado', async () => {
    const { channel, sendMail } = makeChannel({
      SMTP_HOST: 'smtp.brevo.com',
      APP_PUBLIC_URL: 'https://lawzora.com',
    });

    await channel.deliver(INPUT);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('cliente@example.test');
    expect(message.subject).toContain('FAC-0001');
    expect(message.html).toContain('https://lawzora.com/es/portal');
    expect(message.text).toContain('https://lawzora.com/es/portal');
    // El nombre del cliente viene sin allowlist (intake público): se escapa en el HTML.
    expect(message.html).not.toContain('<Uno>');
    expect(message.html).toContain('Cliente &lt;Uno&gt;');
  });

  it('omite con gracia (sin lanzar ni enviar) si el cliente no tiene email', async () => {
    const { channel, sendMail } = makeChannel({ SMTP_HOST: 'smtp.brevo.com' });

    await channel.deliver({ ...INPUT, client: { ...INPUT.client, email: null } });

    expect(sendMail).not.toHaveBeenCalled();
  });
});
