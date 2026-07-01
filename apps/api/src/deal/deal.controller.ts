import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { DealService } from './deal.service';
import { DealMilestoneRemindersService } from './milestone-reminders.service';
import {
  CreateDisclosureDto,
  CreateEscrowHoldingDto,
  CreateEscrowReleaseDto,
  CreateFilingDto,
  CreateFundsFlowLineDto,
  CreateMilestoneDto,
  CreatePartyDto,
  UpdateDisclosureDto,
  UpdateEscrowHoldingDto,
  UpdateFilingDto,
  UpdateFundsFlowLineDto,
  UpdateMilestoneDto,
  UpdatePartyDto,
} from './dto/deal.dto';

/** Operación transaccional (deal): partes, hitos, disclosure schedules y presentaciones registrales por
 * expediente. Solo staff; acotado al tenant por RLS. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('closing')
@Controller('deal')
export class DealController {
  constructor(
    private readonly service: DealService,
    private readonly milestoneReminders: DealMilestoneRemindersService,
  ) {}

  // Disparo manual del avisador de hitos del despacho (segmento literal; antes que `:matterId/...`).
  @Post('milestones/run-reminders')
  runMilestoneReminders(@CurrentUser() user: RequestUser) {
    return this.milestoneReminders.runForTenant(user);
  }

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

  // ── Funds flow / escrow (rutas por id de recurso, antes que las paramétricas) ──
  @Patch('funds-flow/:id')
  updateFundsFlowLine(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFundsFlowLineDto,
  ) {
    return this.service.updateFundsFlowLine(user, id, dto);
  }

  @Delete('funds-flow/:id')
  removeFundsFlowLine(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeFundsFlowLine(user, id);
  }

  @Delete('escrow/releases/:id')
  removeEscrowRelease(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeEscrowRelease(user, id);
  }

  @Post('escrow/:id/releases')
  addEscrowRelease(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateEscrowReleaseDto,
  ) {
    return this.service.addEscrowRelease(user, id, dto);
  }

  @Patch('escrow/:id')
  updateEscrowHolding(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateEscrowHoldingDto,
  ) {
    return this.service.updateEscrowHolding(user, id, dto);
  }

  @Delete('escrow/:id')
  removeEscrowHolding(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.removeEscrowHolding(user, id);
  }

  // Statement PDF (segmentos literales) antes que el overview por expediente.
  @Get(':matterId/funds-flow/statement')
  async fundsFlowStatement(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } = await this.service.buildFundsFlowStatement(user, matterId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(':matterId/funds-flow')
  fundsFlow(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.fundsFlowOverview(user, matterId);
  }

  @Post(':matterId/funds-flow')
  addFundsFlowLine(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateFundsFlowLineDto,
  ) {
    return this.service.addFundsFlowLine(user, matterId, dto);
  }

  @Post(':matterId/escrow')
  addEscrowHolding(
    @CurrentUser() user: RequestUser,
    @Param('matterId') matterId: string,
    @Body() dto: CreateEscrowHoldingDto,
  ) {
    return this.service.addEscrowHolding(user, matterId, dto);
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
