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
import { PaymentsService } from './payments.service';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';

/**
 * Webhook de Stripe. Ruta PÚBLICA (la llama Stripe, no un usuario): el tenant NO sale de un usuario
 * autenticado sino del evento FIRMADO. Requiere el cuerpo CRUDO para verificar la firma (rawBody en
 * `main.ts`). Controller separado para no heredar el `@Roles` del módulo. Ver D-024.
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @HttpCode(200)
  @Post('stripe')
  stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException(apiError('payments.webhookInvalid'));
    }
    return this.payments.handleStripeWebhook(req.rawBody, signature);
  }
}
