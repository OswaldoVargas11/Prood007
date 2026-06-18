import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SubscriptionService } from './subscription.service';
import { StripeBillingService } from './stripe-billing.service';
import { CheckoutDto } from './dto/checkout.dto';
import { AllowExpired } from './allow-expired.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

// Accesible aunque la prueba haya caducado: el muro necesita leer el estado, los planes y suscribirse.
@AllowExpired()
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscription: SubscriptionService,
    private readonly stripe: StripeBillingService,
  ) {}

  /** Estado de la suscripción del despacho (para el banner de prueba y la pantalla de planes). */
  @Get()
  status(@CurrentUser() user: RequestUser) {
    return this.subscription.getStatus(user);
  }

  /** Inicia el pago (Checkout de Stripe) para suscribirse a N plazas. Solo el admin del despacho. */
  @Roles(Role.FIRM_ADMIN)
  @Post('checkout')
  checkout(@CurrentUser() user: RequestUser, @Body() dto: CheckoutDto) {
    return this.stripe.createCheckout(user, dto.seats);
  }

  /** Abre el portal de Stripe para gestionar/cancelar la suscripción. Solo el admin del despacho. */
  @Roles(Role.FIRM_ADMIN)
  @Post('portal')
  portal(@CurrentUser() user: RequestUser) {
    return this.stripe.createPortal(user);
  }
}
