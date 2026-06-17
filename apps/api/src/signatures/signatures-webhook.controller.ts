import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SignaturesService } from './signatures.service';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';

/**
 * Webhook de Signaturit. Ruta PÚBLICA (la llama el proveedor, no un usuario): el tenant NO sale de un
 * usuario autenticado sino del evento FIRMADO. Requiere el cuerpo CRUDO para verificar la firma HMAC
 * (rawBody en `main.ts`). Controller separado para no heredar el `@Roles` del módulo. Ver webhook de
 * cobros (mismo patrón, D-024).
 */
@Controller('signatures/webhook')
export class SignaturesWebhookController {
  constructor(private readonly signatures: SignaturesService) {}

  @Public()
  @HttpCode(200)
  @Post('signaturit')
  signaturit(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signaturit-signature') signature?: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException(apiError('signatures.webhookInvalid'));
    }
    return this.signatures.handleWebhook(req.rawBody, signature);
  }
}
