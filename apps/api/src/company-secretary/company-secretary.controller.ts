import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { CompanySecretaryService } from './company-secretary.service';
import {
  CreateMinuteDto,
  CreateObligationDto,
  CreateShareholderDto,
  CreateTransferDto,
  UpdateObligationDto,
  UpdateShareholderDto,
} from './dto/company-secretary.dto';

/** Secretaría de sociedades (sub-perfil mercantil). Solo staff; acotado al tenant por RLS. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('company-secretary')
export class CompanySecretaryController {
  constructor(private readonly service: CompanySecretaryService) {}

  // Rutas por id de recurso (segmento literal) antes que las paramétricas por cliente.
  @Delete('minutes/:id')
  removeMinute(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeMinute(user, id);
  }

  @Patch('shareholders/:id')
  updateShareholder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateShareholderDto,
  ) {
    return this.service.updateShareholder(user, id, dto);
  }

  @Delete('shareholders/:id')
  removeShareholder(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeShareholder(user, id);
  }

  @Delete('transfers/:id')
  removeTransfer(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeTransfer(user, id);
  }

  @Patch('obligations/:id')
  updateObligation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateObligationDto,
  ) {
    return this.service.updateObligation(user, id, dto);
  }

  @Delete('obligations/:id')
  removeObligation(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeObligation(user, id);
  }

  @Get(':clientId')
  overview(@CurrentUser() user: RequestUser, @Param('clientId') clientId: string) {
    return this.service.overview(user, clientId);
  }

  @Post(':clientId/minutes')
  addMinute(
    @CurrentUser() user: RequestUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateMinuteDto,
  ) {
    return this.service.addMinute(user, clientId, dto);
  }

  @Post(':clientId/shareholders')
  addShareholder(
    @CurrentUser() user: RequestUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateShareholderDto,
  ) {
    return this.service.addShareholder(user, clientId, dto);
  }

  @Post(':clientId/transfers')
  addTransfer(
    @CurrentUser() user: RequestUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateTransferDto,
  ) {
    return this.service.addTransfer(user, clientId, dto);
  }

  @Post(':clientId/obligations')
  addObligation(
    @CurrentUser() user: RequestUser,
    @Param('clientId') clientId: string,
    @Body() dto: CreateObligationDto,
  ) {
    return this.service.addObligation(user, clientId, dto);
  }
}
