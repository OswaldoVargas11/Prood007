import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Gestión de webhooks SALIENTES del despacho. Solo el administrador (`FIRM_ADMIN`) puede registrar/borrar
 * endpoints y lanzar pruebas. El `secret` de firma se devuelve solo en el alta.
 */
@Roles(Role.FIRM_ADMIN)
@Controller('webhooks/endpoints')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  /** Registra un endpoint y devuelve su secreto de firma (única vez). */
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(user, dto);
  }

  /** Lista los endpoints del despacho (sin exponer el secreto). */
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.webhooks.list(user);
  }

  /** Elimina un endpoint. */
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.webhooks.remove(user, id);
  }

  /** Envía un evento de prueba al endpoint para validar la integración. */
  @Post(':id/test')
  test(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.webhooks.sendTest(user, id);
  }
}
