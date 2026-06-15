import { Controller, Get } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Panel principal del despacho (staff). Resumen agregado, solo lectura, por tenant. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.dashboard.summary(user);
  }
}
