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
import { StripeBillingService } from './stripe-billing.service';
import { Public } from '../auth/decorators/public.decorator';
import { AllowExpired } from './allow-expired.decorator';
import { apiError } from '../common/api-messages';

/**
 * Webhook de Stripe para la SUSCRIPCIÓN de plataforma (Lawzora cobra al despacho). Ruta PÚBLICA (la
 * llama Stripe): el tenant sale del evento FIRMADO (metadata), no de un usuario. Cuerpo CRUDO para
 * verificar la firma (rawBody en main.ts). Separado del webhook de cobros (payments) y del de firma.
 */
@Public()
@AllowExpired()
@Controller('subscription/webhook')
export class SubscriptionWebhookController {
  constructor(private readonly billing: StripeBillingService) {}

  @Post('stripe')
  @HttpCode(200)
  stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException(apiError('subscription.webhookInvalid'));
    }
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
