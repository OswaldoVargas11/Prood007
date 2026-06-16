import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { BillingService } from './billing.service';
import { CreateBillingScheduleDto } from './dto/create-billing-schedule.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Facturación programada (D-028): crear y leer planes (recurrente / planes de pago) + su cuadro de
 * cuotas. Solo staff del despacho; acotado al tenant (RLS + `user.tenantId`). La emisión/cobro llega en
 * RP3/RP4.
 */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Crea un plan + genera su cuadro de cuotas. */
  @Post('schedules')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBillingScheduleDto) {
    return this.billing.createSchedule(user, dto);
  }

  /** Planes de un expediente (`?matterId=`). */
  @Get('schedules')
  list(@CurrentUser() user: RequestUser, @Query('matterId') matterId: string) {
    return this.billing.listMatterSchedules(user, matterId);
  }

  /** Un plan con su cuadro de cuotas. */
  @Get('schedules/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.billing.getSchedule(user, id);
  }

  /**
   * Emite las facturas de los periodos VENCIDOS del plan (RECURRING): 1 factura por periodo vía el núcleo
   * fiscal (serie + Verifactu/e-CF + QR), atómico por periodo. El cron de barrido (RP5) hará lo mismo en
   * automático para todos los planes vencidos.
   */
  @Post('schedules/:id/run')
  run(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.billing.runDueEmissions(user, id);
  }

  /**
   * Cobra una cuota de un plan de pago por ANTICIPOS (ADVANCE): emite su factura de anticipo (devengo al
   * cobro) y acredita el retainer. La deducción de los anticipos en la factura final ya existe (R3b).
   */
  @Post('installments/:id/collect')
  collect(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.billing.collectAnticipoInstallment(user, id);
  }
}
