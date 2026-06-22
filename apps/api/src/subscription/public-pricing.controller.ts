import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SubscriptionService } from './subscription.service';

/** Datos de precios PÚBLICOS (landing): hoy solo el cupo de Fundador restante. Sin sesión. */
@Public()
@Controller('pricing')
export class PublicPricingController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get('founder')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  founderStatus() {
    return this.subscription.founderStatus();
  }
}
