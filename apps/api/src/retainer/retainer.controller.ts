import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { RetainerService } from './retainer.service';
import { RecordDepositDto } from './dto/record-deposit.dto';
import { RecordAnticipoDto } from './dto/record-anticipo.dto';
import { ApplyRetainerDto } from './dto/apply-retainer.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Provisión de fondos / retainer (saldo por expediente). Solo staff del despacho; todo acotado al
 * tenant (RLS + `user.tenantId`). PR-R2: cobro manual (SUPLIDO/GENERICO) + lecturas; ANTICIPO se
 * rechaza hasta PR-R2b (exige emisión de factura).
 */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('retainer')
export class RetainerController {
  constructor(private readonly retainer: RetainerService) {}

  /** Registra un cobro de provisión NO fiscal (SUPLIDO/GENERICO) en el expediente. */
  @Post('deposit')
  deposit(@CurrentUser() user: RequestUser, @Body() dto: RecordDepositDto) {
    return this.retainer.deposit(user, dto);
  }

  /** Cobro de provisión ANTICIPO: emite factura de anticipo (Verifactu/e-CF) y acredita el saldo. */
  @Post('anticipo')
  anticipo(@CurrentUser() user: RequestUser, @Body() dto: RecordAnticipoDto) {
    return this.retainer.depositAnticipo(user, dto);
  }

  /** Aplica saldo de provisión (SUPLIDO/GENERICO) al cobro de una factura del expediente. */
  @Post('apply')
  apply(@CurrentUser() user: RequestUser, @Body() dto: ApplyRetainerDto) {
    return this.retainer.applyToInvoice(user, dto);
  }

  /** Saldo + movimientos de la provisión de un expediente. */
  @Get('matter/:matterId')
  matterAccount(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.retainer.getMatterAccount(user, matterId);
  }

  /** Saldo agregado de provisión de un cliente (Σ de sus expedientes, derivado). */
  @Get('client/:clientId')
  clientAggregate(@CurrentUser() user: RequestUser, @Param('clientId') clientId: string) {
    return this.retainer.getClientAggregate(user, clientId);
  }
}
