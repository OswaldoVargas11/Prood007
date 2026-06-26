import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { DealService } from './deal.service';
import {
  CreateDisclosureDto,
  CreateFilingDto,
  CreateMilestoneDto,
  CreatePartyDto,
  UpdateDisclosureDto,
  UpdateFilingDto,
  UpdateMilestoneDto,
  UpdatePartyDto,
} from './dto/deal.dto';

/** Operación transaccional (deal): partes, hitos, disclosure schedules y presentaciones registrales por
 * expediente. Solo staff; acotado al tenant por RLS. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('closing')
@Controller('deal')
export class DealController {
  constructor(private readonly service: DealService) {}

  // Rutas por id de recurso (segmento literal) antes que las paramétricas por expediente.
  @Patch('parties/:id')
  updateParty(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartyDto,
  ) {
    return this.service.updateParty(user, id, dto);
  }

  @Delete('parties/:id')
  removeParty(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeParty(user, id);
  }

  @Patch('milestones/:id')
  updateMilestone(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.service.updateMilestone(user, id, dto);
  }

  @Delete('milestones/:id')
  removeMilestone(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeMilestone(user, id);
  }

  @Patch('disclosures/:id')
  updateDisclosure(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateDisclosureDto,
  ) {
    return this.service.updateDisclosure(user, id, dto);
  }

  @Delete('disclosures/:id')
  removeDisclosure(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeDisclosure(user, id);
  }

  @Patch('filings/:id')
  updateFiling(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFilingDto,
  ) {
    return this.service.updateFiling(user, id, dto);
  }

  @Delete('filings/:id')
  removeFiling(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeFiling(user, id);
  }

  @Get(':matterId')
  overview(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.overview(user, matterId);
  }

  @Post(':matterId/parties')
  addParty(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreatePartyDto,
  ) {
    return this.service.addParty(user, matterId, dto);
  }

  @Post(':matterId/milestones')
  addMilestone(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateMilestoneDto,
  ) {
    return this.service.addMilestone(user, matterId, dto);
  }

  @Post(':matterId/disclosures')
  addDisclosure(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateDisclosureDto,
  ) {
    return this.service.addDisclosure(user, matterId, dto);
  }

  @Post(':matterId/filings')
  addFiling(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateFilingDto,
  ) {
    return this.service.addFiling(user, matterId, dto);
  }
}
