import { Controller, Get } from '@nestjs/common';
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
}
