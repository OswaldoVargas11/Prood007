import { BadRequestException } from '@nestjs/common';
import { SignaturesWebhookController } from './signatures-webhook.controller';

describe('SignaturesWebhookController', () => {
  function build() {
    const handleWebhook = jest.fn().mockResolvedValue({ received: true });
    const controller = new SignaturesWebhookController({ handleWebhook } as never);
    return { controller, handleWebhook };
  }

  it('sin cuerpo crudo → 400, no llega al servicio', () => {
    const { controller, handleWebhook } = build();
    expect(() => controller.signaturit({ rawBody: undefined } as never, 'sig')).toThrow(
      BadRequestException,
    );
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('sin cabecera de firma → 400, no llega al servicio', () => {
    const { controller, handleWebhook } = build();
    expect(() => controller.signaturit({ rawBody: Buffer.from('{}') } as never, undefined)).toThrow(
      BadRequestException,
    );
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('con cuerpo y firma, delega en el servicio', async () => {
    const { controller, handleWebhook } = build();
    const req = { rawBody: Buffer.from('{}') } as never;
    const res = await controller.signaturit(req, 'sig');
    expect(res).toEqual({ received: true });
    expect(handleWebhook).toHaveBeenCalledWith(Buffer.from('{}'), 'sig');
  });
});
