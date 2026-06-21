import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SubscriptionService } from './subscription.service';
import { StripeBillingService } from './stripe-billing.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ChangeSeatsDto } from './dto/change-seats.dto';
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
    return this.stripe.createCheckout(user, {
      seats: dto.seats,
      cycle: dto.cycle ?? 'MONTHLY',
      founder: dto.founder ?? false,
    });
  }

  /** Abre el portal de Stripe para gestionar el método de pago/facturas. Solo el admin del despacho. */
  @Roles(Role.FIRM_ADMIN)
  @Post('portal')
  portal(@CurrentUser() user: RequestUser) {
    return this.stripe.createPortal(user);
  }

  /** Cancela la suscripción al final del periodo (conserva acceso hasta entonces). Solo el admin. */
  @Roles(Role.FIRM_ADMIN)
  @Post('cancel')
  cancel(@CurrentUser() user: RequestUser) {
    return this.stripe.cancel(user);
  }

  /** Deshace una cancelación programada y reanuda la suscripción. Solo el admin. */
  @Roles(Role.FIRM_ADMIN)
  @Post('resume')
  resume(@CurrentUser() user: RequestUser) {
    return this.stripe.resume(user);
  }

  /** Ajusta el nº de plazas contratadas (prorrateado en la próxima factura). Solo el admin. */
  @Roles(Role.FIRM_ADMIN)
  @Post('seats')
  changeSeats(@CurrentUser() user: RequestUser, @Body() dto: ChangeSeatsDto) {
    return this.stripe.changeSeats(user, dto.seats);
  }
}
