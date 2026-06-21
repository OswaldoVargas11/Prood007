import { Controller, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { ProductivityCron } from './productivity.cron';

/** Avisos de productividad. El barrido completo va por cron semanal; aquí un disparo manual del despacho. */
@Roles(Role.FIRM_ADMIN)
@Controller('productivity')
export class ProductivityController {
  constructor(private readonly cron: ProductivityCron) {}

  /** Genera ahora los avisos de tiempo sin facturar de ESTE despacho (para probar sin esperar al lunes). */
  @Post('run')
  run(@CurrentUser() user: RequestUser) {
    return this.cron.runForTenant(user.tenantId);
  }
}
