import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@legalflow/domain';
import { PortalService } from './portal.service';
import { pdfStream } from '../common/pdf-response';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

// Tipo mínimo del archivo subido por Multer.
interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite de subida del cliente: 25 MB (igual que el staff). */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Portal del cliente: solo el rol CLIENT, solo lectura, solo sus propios expedientes. */
@Roles(Role.CLIENT)
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.portal.myProfile(user);
  }

  @Get('matters')
  matters(@CurrentUser() user: RequestUser) {
    return this.portal.listMatters(user);
  }

  @Get('matters/:id')
  matter(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.getMatter(user, id);
  }

  @Get('matters/:id/documents')
  documents(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.listDocuments(user, id);
  }

  /** El cliente sube un documento a su propio expediente (queda pendiente de revisión del despacho). */
  @Post('matters/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
    @Body('name') name?: string,
  ) {
    return this.portal.uploadDocument(user, id, name, file);
  }

  @Get('matters/:id/ledger')
  ledger(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.ledgerView(user, id);
  }

  @Get('matters/:id/tasks')
  tasks(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.listTasks(user, id);
  }

  /** Saldo de provisión de fondos del expediente propio del cliente (solo lectura). */
  @Get('matters/:id/retainer')
  retainer(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.retainerView(user, id);
  }

  @Get('invoices')
  invoices(@CurrentUser() user: RequestUser) {
    return this.portal.listInvoices(user);
  }

  /** ¿Puede el cliente pagar online? (para mostrar u ocultar el botón "Pagar online"). */
  @Get('payments/config')
  paymentConfig(@CurrentUser() user: RequestUser) {
    return this.portal.paymentConfig(user);
  }

  /** El cliente paga online SU propia factura: devuelve el enlace de Stripe Checkout. */
  @Post('invoices/:id/checkout')
  checkout(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.payInvoice(user, id);
  }

  /** Descarga el PDF de una factura propia del cliente. */
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, number } = await this.portal.invoicePdf(user, id);
    return pdfStream(buffer, `Factura-${number}.pdf`);
  }
}
