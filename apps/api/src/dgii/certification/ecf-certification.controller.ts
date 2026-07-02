import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/auth.types';
import { EcfCertificationService } from './ecf-certification.service';
import { RunCertificationDto } from './dto/run-certification.dto';

/** Simulacro del set de e-CF del kit de certificación DGII (solo admin, solo DGII_ENV=test|cert). */
@Roles(Role.FIRM_ADMIN)
@Controller('dgii/certification')
export class EcfCertificationController {
  constructor(private readonly certification: EcfCertificationService) {}

  @Post('run')
  run(@CurrentUser() user: RequestUser, @Body() dto: RunCertificationDto) {
    return this.certification.run(user, dto);
  }
}
