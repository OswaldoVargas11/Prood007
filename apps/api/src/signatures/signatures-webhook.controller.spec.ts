import { BadRequestException } from '@nestjs/common';
import { SignaturesWebhookController } from './signatures-webhook.controller';

describe('SignaturesWebhookController', () => {
  const originalSecret = process.env.SIGNATURE_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SIGNATURE_WEBHOOK_SECRET;
    else process.env.SIGNATURE_WEBHOOK_SECRET = originalSecret;
  });

  function build() {
    const handleWebhook = jest.fn().mockResolvedValue({ received: true });
    const handleVerifiedWebhook = jest.fn().mockResolvedValue({ received: true });
    const controller = new SignaturesWebhookController({
      handleWebhook,
      handleVerifiedWebhook,
    } as never);
    return { controller, handleWebhook, handleVerifiedWebhook };
  }

  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

  it('sin cuerpo crudo → 400, no llega al servicio', () => {
    const { controller, handleWebhook } = build();
    expect(() => controller.signaturit({ rawBody: undefined } as never, 'sig')).toThrow(
      BadRequestException,
    );
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('sin firma HMAC ni Basic auth → 400, no llega al servicio', () => {
    const { controller, handleWebhook, handleVerifiedWebhook } = build();
    expect(() =>
      controller.signaturit({ rawBody: Buffer.from('{}') } as never, undefined, undefined),
    ).toThrow(BadRequestException);
    expect(handleWebhook).not.toHaveBeenCalled();
    expect(handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it('con cuerpo y firma HMAC, delega en handleWebhook (vía legado/interna)', async () => {
    const { controller, handleWebhook } = build();
    const req = { rawBody: Buffer.from('{}') } as never;
    const res = await controller.signaturit(req, 'sig');
    expect(res).toEqual({ received: true });
    expect(handleWebhook).toHaveBeenCalledWith(Buffer.from('{}'), 'sig');
  });

  it('Basic auth con la contraseña correcta (events_url real de Signaturit) → handleVerifiedWebhook', async () => {
    process.env.SIGNATURE_WEBHOOK_SECRET = 'whsec_prueba';
    const { controller, handleWebhook, handleVerifiedWebhook } = build();
    const req = { rawBody: Buffer.from('{"type":"document_completed"}') } as never;
    const res = await controller.signaturit(req, undefined, basic('whk', 'whsec_prueba'));
    expect(res).toEqual({ received: true });
    expect(handleVerifiedWebhook).toHaveBeenCalledWith(
      Buffer.from('{"type":"document_completed"}'),
    );
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('Basic auth con contraseña incorrecta → 400 (el usuario se ignora, la contraseña manda)', () => {
    process.env.SIGNATURE_WEBHOOK_SECRET = 'whsec_prueba';
    const { controller, handleVerifiedWebhook } = build();
    expect(() =>
      controller.signaturit(
        { rawBody: Buffer.from('{}') } as never,
        undefined,
        basic('whk', 'otra-cosa'),
      ),
    ).toThrow(BadRequestException);
    expect(handleVerifiedWebhook).not.toHaveBeenCalled();
  });

  it('Basic auth SIN secreto configurado → 400 (fail-closed: nunca acepta todo)', () => {
    delete process.env.SIGNATURE_WEBHOOK_SECRET;
    const { controller, handleVerifiedWebhook } = build();
    expect(() =>
      controller.signaturit(
        { rawBody: Buffer.from('{}') } as never,
        undefined,
        basic('whk', 'cualquiera'),
      ),
    ).toThrow(BadRequestException);
    expect(handleVerifiedWebhook).not.toHaveBeenCalled();
  });
});
