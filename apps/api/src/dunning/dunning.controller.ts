import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { DunningService } from './dunning.service';
import { ListRemindersQueryDto } from './dto/list-reminders.dto';
import { UpdateDunningRulesDto } from './dto/update-dunning-rules.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Dunning (recordatorios de cobro). Solo staff del despacho; todo acotado al tenant del usuario
 * (RLS + `user.tenantId`). El cron automático llega en PR-D3 reutilizando `DunningService`.
 */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('dunning')
export class DunningController {
  constructor(private readonly dunning: DunningService) {}

  /** "Recordar ahora": evalúa las facturas vencidas del despacho y dispara los recordatorios debidos. */
  @Post('run')
  run(@CurrentUser() user: RequestUser) {
    return this.dunning.runForTenant(user);
  }

  /** Recordatorios ya generados (línea de tiempo del despacho), opcionalmente por factura. */
  @Get('reminders')
  reminders(@CurrentUser() user: RequestUser, @Query() query: ListRemindersQueryDto) {
    return this.dunning.listReminders(user, query.invoiceId);
  }

  /** Calendario de dunning efectivo del despacho (configurado o el de por defecto). */
  @Get('rules')
  rules(@CurrentUser() user: RequestUser) {
    return this.dunning.getRules(user);
  }

  /** Elige el canal de cada etapa (IN_APP por defecto; EMAIL opt-in). Solo el admin del despacho. */
  @Put('rules')
  @Roles(Role.FIRM_ADMIN)
  updateRules(@CurrentUser() user: RequestUser, @Body() dto: UpdateDunningRulesDto) {
    return this.dunning.updateRules(user, dto);
  }
}
