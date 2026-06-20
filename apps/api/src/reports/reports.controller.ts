import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Informes de gestión del despacho. Solo administrador. */
@Roles(Role.FIRM_ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('aged-receivables')
  agedReceivables(@CurrentUser() user: RequestUser) {
    return this.reports.agedReceivables(user);
  }

  @Get('time-by-lawyer')
  timeByLawyer(@CurrentUser() user: RequestUser) {
    return this.reports.timeByLawyer(user);
  }

  @Get('profitability')
  profitability(@CurrentUser() user: RequestUser) {
    return this.reports.profitability(user);
  }

  /** Resumen fiscal para la gestoría (año + trimestre opcional). `quarter=0` o ausente = año completo. */
  @Get('tax-summary')
  taxSummary(
    @CurrentUser() user: RequestUser,
    @Query('year', new DefaultValuePipe(new Date().getUTCFullYear()), ParseIntPipe) year: number,
    @Query('quarter', new DefaultValuePipe(0), ParseIntPipe) quarter: number,
  ) {
    return this.reports.taxSummary(user, year, quarter || undefined);
  }
}
