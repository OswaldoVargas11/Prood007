import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@legalflow/domain';
import { LedgerService } from './ledger.service';
import { pdfStream } from '../common/pdf-response';
import { safeContentDisposition } from '../common/safe-download';
import { CreateLedgerEntryDto } from './dto/create-ledger-entry.dto';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { ListTimeQueryDto } from './dto/list-time.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesQueryDto } from './dto/list-invoices.dto';
import { PreviewInvoiceDto } from './dto/preview-invoice.dto';
import { ProposeCostDto } from './dto/propose-cost.dto';
import { RectifyInvoiceDto } from './dto/rectify-invoice.dto';
import { ResolveApprovalDto } from './dto/resolve-approval.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

// Tipo mínimo del archivo subido por Multer (justificante del gasto).
interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite del justificante: 10 MB. */
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  // ── Aprobación de costes ──────────────────────────────────────────────
  /** Un letrado o admin propone un coste pendiente de aprobación, con justificante opcional. */
  @Post('costs/propose')
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: MAX_RECEIPT_BYTES } }))
  proposeCost(
    @CurrentUser() user: RequestUser,
    @Body() dto: ProposeCostDto,
    @UploadedFile() receipt?: MulterFile,
  ) {
    return this.ledger.proposeCost(user, dto, receipt);
  }

  /** Descarga/visualización del justificante de un suplido (inline solo para tipos seguros). */
  @Get('costs/:id/receipt')
  async receipt(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const { buffer, mime, name } = await this.ledger.getReceipt(user, id);
    return new StreamableFile(buffer, {
      type: mime,
      disposition: safeContentDisposition(mime, name),
    });
  }

  /** Costes propuestos pendientes (solo admin). */
  @Roles(Role.FIRM_ADMIN)
  @Get('approvals')
  listApprovals(@CurrentUser() user: RequestUser) {
    return this.ledger.listApprovals(user);
  }

  /**
   * M-4: verificación de integridad de la cadena fiscal inmutable del despacho (huella encadenada de
   * FiscalEvent). Devuelve `{ ok, checked, brokenAt? }`. Pensado para conciliación periódica — además del
   * assert de mínimo privilegio del rol de BD al arranque, da detección activa de manipulación. Solo admin.
   */
  @Roles(Role.FIRM_ADMIN)
  @Get('fiscal-chain/verify')
  verifyFiscalChain(@CurrentUser() user: RequestUser) {
    return this.ledger.verifyFiscalChain(user.tenantId);
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

  /** Listado de fichas de tiempo (captura sin fricción): repaso del día y tiempo sin facturar. */
  @Get('time')
  listTime(@CurrentUser() user: RequestUser, @Query() query: ListTimeQueryDto) {
    return this.ledger.listTime(user, query);
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

  /** Listado global de facturas del despacho (filtros: `status`, `overdue`). Antes de `:id`. */
  @Get('invoices')
  listInvoices(@CurrentUser() user: RequestUser, @Query() query: ListInvoicesQueryDto) {
    return this.ledger.listInvoices(user, query);
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

  /**
   * Emite una factura RECTIFICATIVA que reversa por completo la factura (Verifactu R1/S · e-CF nota de
   * crédito tipo 34). Caso principal: corregir un e-CF rechazado por la DGII. La original es inmutable.
   */
  @Post('invoices/:id/rectify')
  rectifyInvoice(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RectifyInvoiceDto,
  ) {
    return this.ledger.rectifyInvoice(user, id, dto);
  }
}
