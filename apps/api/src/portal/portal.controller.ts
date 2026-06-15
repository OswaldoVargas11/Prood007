import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PortalService } from './portal.service';
import { pdfStream } from '../common/pdf-response';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

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

  @Get('matters/:id/ledger')
  ledger(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.ledgerView(user, id);
  }

  @Get('matters/:id/tasks')
  tasks(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.portal.listTasks(user, id);
  }

  @Get('invoices')
  invoices(@CurrentUser() user: RequestUser) {
    return this.portal.listInvoices(user);
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
