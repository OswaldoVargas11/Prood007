import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MatterStatus, Role } from '@legalflow/domain';
import { MattersService } from './matters.service';
import { CreateMatterDto } from './dto/create-matter.dto';
import { UpdateMatterDto } from './dto/update-matter.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AssignLawyerDto } from './dto/assign-lawyer.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('matters')
export class MattersController {
  constructor(private readonly matters: MattersService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMatterDto) {
    return this.matters.create(user, dto);
  }

  /** Letrados asignables del despacho. Solo administrador (es quien asigna). */
  @Get('assignees')
  @Roles(Role.FIRM_ADMIN)
  assignees(@CurrentUser() user: RequestUser) {
    return this.matters.listAssignees(user);
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('status') status?: MatterStatus,
    @Query('clientId') clientId?: string,
  ) {
    return this.matters.findAll(user, page, Math.min(pageSize, 100), status, clientId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.matters.findOne(user, id);
  }

  /** Línea de tiempo unificada del expediente (documentos, tareas, ledger, correos, chat). */
  @Get(':id/timeline')
  timeline(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.matters.timeline(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateMatterDto) {
    return this.matters.update(user, id, dto);
  }

  /** Asigna o desasigna el letrado responsable. Solo administrador del despacho. */
  @Patch(':id/lawyer')
  @Roles(Role.FIRM_ADMIN)
  assignLawyer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AssignLawyerDto,
  ) {
    return this.matters.assignLawyer(user, id, dto.lawyerId);
  }

  @Patch(':id/status')
  changeStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    return this.matters.changeStatus(user, id, dto.status);
  }
}
