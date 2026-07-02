import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { FiscalReportsService, type FiscalReportQuery } from './fiscal-reports.service';
import { pdfStream } from '../common/pdf-response';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Informe fiscal por periodo (solo administrador). Precursor del modelo 303 (ES) y de las declaraciones
 * DGII (RD): base imponible, impuesto repercutido por tipo, retención IRPF y desglose por serie. Solo
 * lectura sobre las facturas emitidas; todo acotado por tenant (RLS). `month` (1-12) manda sobre `quarter`
 * (1-4); sin ninguno, el año completo.
 */
@Roles(Role.FIRM_ADMIN)
@Controller('reports/fiscal')
export class FiscalReportsController {
  constructor(private readonly reports: FiscalReportsService) {}

  private toQuery(year: number, month: number, quarter: number): FiscalReportQuery {
    return { year, month: month || undefined, quarter: quarter || undefined };
  }

  @Get()
  report(
    @CurrentUser() user: RequestUser,
    @Query('year', new DefaultValuePipe(new Date().getUTCFullYear()), ParseIntPipe) year: number,
    @Query('month', new DefaultValuePipe(0), ParseIntPipe) month: number,
    @Query('quarter', new DefaultValuePipe(0), ParseIntPipe) quarter: number,
  ) {
    return this.reports.periodReport(user, this.toQuery(year, month, quarter));
  }

  @Get('pdf')
  async pdf(
    @CurrentUser() user: RequestUser,
    @Query('year', new DefaultValuePipe(new Date().getUTCFullYear()), ParseIntPipe) year: number,
    @Query('month', new DefaultValuePipe(0), ParseIntPipe) month: number,
    @Query('quarter', new DefaultValuePipe(0), ParseIntPipe) quarter: number,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.reports.periodPdf(
      user,
      this.toQuery(year, month, quarter),
    );
    return pdfStream(buffer, filename);
  }

  @Get('xlsx')
  async xlsx(
    @CurrentUser() user: RequestUser,
    @Query('year', new DefaultValuePipe(new Date().getUTCFullYear()), ParseIntPipe) year: number,
    @Query('month', new DefaultValuePipe(0), ParseIntPipe) month: number,
    @Query('quarter', new DefaultValuePipe(0), ParseIntPipe) quarter: number,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.reports.periodXlsx(
      user,
      this.toQuery(year, month, quarter),
    );
    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
