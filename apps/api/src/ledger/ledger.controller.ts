import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { LedgerService } from './ledger.service';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Post('entries')
  addEntry(@CurrentUser() user: RequestUser, @Body() dto: CreateLedgerEntryDto) {
    return this.ledger.addEntry(user, dto);
  }

  @Post('time')
  addTime(@CurrentUser() user: RequestUser, @Body() dto: CreateTimeEntryDto) {
    return this.ledger.addTimeEntry(user, dto);
  }

  @Get('matter/:matterId')
  matterLedger(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.ledger.getMatterLedger(user, matterId);
  }

  @Post('invoices')
  createInvoice(@CurrentUser() user: RequestUser, @Body() dto: CreateInvoiceDto) {
    return this.ledger.createInvoice(user, dto);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ledger.getInvoice(user, id);
  }

  @Post('invoices/:id/pay')
  payInvoice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ledger.payInvoice(user, id);
  }
}
