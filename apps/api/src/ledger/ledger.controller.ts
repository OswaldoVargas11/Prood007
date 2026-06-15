import { Body, Controller, Get, Param, Post, StreamableFile } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { LedgerService } from './ledger.service';
import { pdfStream } from '../common/pdf-response';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { ProposeCostDto } from './dto/propose-cost.dto';
import { ResolveApprovalDto } from './dto/resolve-approval.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  // ── Aprobación de costes ──────────────────────────────────────────────
  /** Un letrado o admin propone un coste pendiente de aprobación. */
  @Post('costs/propose')
  proposeCost(@CurrentUser() user: RequestUser, @Body() dto: ProposeCostDto) {
    return this.ledger.proposeCost(user, dto);
  }

  /** Costes propuestos pendientes (solo admin). */
  @Roles(Role.FIRM_ADMIN)
  @Get('approvals')
  listApprovals(@CurrentUser() user: RequestUser) {
    return this.ledger.listApprovals(user);
  }

  @Roles(Role.FIRM_ADMIN)
  @Post('approvals/:id/approve')
  approveCost(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveApprovalDto,
  ) {
    return this.ledger.approveCost(user, id, dto);
  }

  @Roles(Role.FIRM_ADMIN)
  @Post('approvals/:id/reject')
  rejectCost(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ResolveApprovalDto,
  ) {
    return this.ledger.rejectCost(user, id, dto);
  }

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

  /** Pre-cálculo fiscal en vivo (read-only): no emite factura, solo devuelve base/IVA/IRPF/ITBIS/total. */
  @Post('invoices/preview')
  previewInvoice(@CurrentUser() user: RequestUser, @Body() dto: PreviewInvoiceDto) {
    return this.ledger.previewInvoice(user, dto);
  }

  @Post('invoices')
  createInvoice(@CurrentUser() user: RequestUser, @Body() dto: CreateInvoiceDto) {
    return this.ledger.createInvoice(user, dto);
  }

  @Get('invoices/:id')
  getInvoice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ledger.getInvoice(user, id);
  }

  /** Descarga la representación impresa (PDF) de la factura. */
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, number } = await this.ledger.invoicePdf(user, id);
    return pdfStream(buffer, `Factura-${number}.pdf`);
  }

  @Post('invoices/:id/pay')
  payInvoice(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ledger.payInvoice(user, id);
  }
}
