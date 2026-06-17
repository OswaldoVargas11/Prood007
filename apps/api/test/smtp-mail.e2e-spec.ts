import type { ConfigService } from '@nestjs/config';
import { SmtpMailProvider } from '../src/auth/mail/smtp-mail.provider';
import { NoopMailProvider } from '../src/auth/mail/mail.provider';

// Mock de nodemailer: no abre conexión SMTP real; capturamos lo enviado. Nombres con prefijo `mock`
// para que el hoisting de jest.mock permita referenciarlos en el factory.
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport }));

/**
 * Cubre el proveedor SMTP sin servidor real (nodemailer mockeado) y el stub Noop. Verifica el envío
 * de correo genérico y del enlace de recuperación, y que el transporte se crea una sola vez (perezoso).
 */
describe('SmtpMailProvider (e2e, nodemailer mockeado)', () => {
  const config = {
    get: (k: string) =>
      ({
        SMTP_HOST: 'smtp.test.local',
        SMTP_PORT: '587',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        MAIL_FROM: 'no-reply@despacho.test',
      })[k],
  } as unknown as ConfigService;

  beforeEach(() => {
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
  });

  it('envía un correo genérico con remitente y contenido', async () => {
    const provider = new SmtpMailProvider(config);
    await provider.sendMail({ to: 'cliente@despacho.test', subject: 'Hola', html: '<b>Hola</b>' });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const arg = mockSendMail.mock.calls[0][0];
    expect(arg.to).toBe('cliente@despacho.test');
    expect(arg.from).toBe('no-reply@despacho.test');
    expect(arg.subject).toBe('Hola');
  });

  it('envía el enlace de recuperación y reutiliza el transporte (perezoso, una sola vez)', async () => {
    const provider = new SmtpMailProvider(config);
    await provider.sendPasswordReset('user@despacho.test', 'https://app/reset-password?token=abc');
    await provider.sendPasswordReset('user@despacho.test', 'https://app/reset-password?token=def');
    expect(mockSendMail).toHaveBeenCalledTimes(2);
    // El cuerpo incluye el enlace.
    const html = String(mockSendMail.mock.calls[0][0].html);
    expect(html).toContain('reset-password?token=abc');
    // Transporte creado una sola vez pese a varios envíos.
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
  });

  it('cae a remitente por defecto cuando no hay MAIL_FROM', async () => {
    const cfg = { get: () => undefined } as unknown as ConfigService;
    const provider = new SmtpMailProvider(cfg);
    await provider.sendMail({ to: 'x@y.test', subject: 'S', html: 'H' });
    expect(mockSendMail.mock.calls[0][0].from).toContain('@');
  });

  it('NoopMailProvider no envía (no usa transporte) pero resuelve', async () => {
    const noop = new NoopMailProvider();
    await expect(
      noop.sendPasswordReset('z@y.test', 'https://app/reset-password?token=z'),
    ).resolves.toBeUndefined();
  });
});
