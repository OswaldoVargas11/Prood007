import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { KycService } from './kyc.service';
import { UpsertKycDto } from './dto/upsert-kyc.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** KYC/AML del despacho (prevención de blanqueo). Staff (administrador y letrado). */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  overview(@CurrentUser() user: RequestUser) {
    return this.kyc.overview(user);
  }

  @Get('summary')
  summary(@CurrentUser() user: RequestUser) {
    return this.kyc.summary(user);
  }

  @Get(':clientId')
  get(@CurrentUser() user: RequestUser, @Param('clientId') clientId: string) {
    return this.kyc.getForClient(user, clientId);
  }

  @Put(':clientId')
  upsert(
    @CurrentUser() user: RequestUser,
    @Param('clientId') clientId: string,
    @Body() dto: UpsertKycDto,
  ) {
    return this.kyc.upsert(user, clientId, dto);
  }
}
