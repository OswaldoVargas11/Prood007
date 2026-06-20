import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { AuditService } from './audit.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Registro de auditoría (solo lectura, append-only). Solo el administrador del despacho. */
@Roles(Role.FIRM_ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.audit.listForTenant(user, Math.max(1, page), Math.min(100, Math.max(1, pageSize)));
  }
}
