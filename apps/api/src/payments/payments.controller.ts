import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Estado del cobro online para la jurisdicción del tenant (online vs solo manual). */
  @Get('config')
  config(@CurrentUser() user: RequestUser) {
    return this.payments.paymentConfig(user);
  }

  /** Registra un cobro manual (total o parcial) sobre una factura. */
  @Post()
  record(@CurrentUser() user: RequestUser, @Body() dto: RecordPaymentDto) {
    return this.payments.recordManualPayment(user, dto);
  }

  /** Crea un enlace de pago online (Stripe Connect) para el saldo pendiente de la factura. */
  @Post('checkout')
  checkout(@CurrentUser() user: RequestUser, @Body() dto: CreateCheckoutDto) {
    return this.payments.createCheckout(user, dto.invoiceId);
  }

  /** Cobros de una factura. */
  @Get('by-invoice/:invoiceId')
  byInvoice(@CurrentUser() user: RequestUser, @Param('invoiceId') invoiceId: string) {
    return this.payments.listByInvoice(user, invoiceId);
  }

  /** Inicia/continúa el onboarding de la cuenta conectada de Stripe (solo admin). */
  @Roles(Role.FIRM_ADMIN)
  @Post('connect/onboard')
  connectOnboard(@CurrentUser() user: RequestUser) {
    return this.payments.connectOnboard(user);
  }

  /** Estado de la conexión Stripe del despacho (solo admin). */
  @Roles(Role.FIRM_ADMIN)
  @Get('connect/status')
  connectStatus(@CurrentUser() user: RequestUser) {
    return this.payments.connectStatus(user);
  }
}
