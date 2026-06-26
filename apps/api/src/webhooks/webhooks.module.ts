import { Global, Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

/**
 * Webhooks salientes. `@Global` para que cualquier servicio (p. ej. `MattersService`) pueda inyectar
 * `WebhooksService` y emitir eventos sin acoplar módulos (mismo patrón que el módulo de IA).
 */
@Global()
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
