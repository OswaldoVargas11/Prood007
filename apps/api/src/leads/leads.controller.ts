import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LeadStatus, Role } from '@legalflow/domain';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Mini-CRM de captación (embudo de prospectos). Staff del despacho. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('status') status?: LeadStatus) {
    return this.leads.list(user, status);
  }

  /** Declarado ANTES de :id para que no lo capture la ruta paramétrica. */
  @Get('intake-link')
  intakeLink(@CurrentUser() user: RequestUser) {
    return this.leads.intakeLink(user);
  }

  /** Rota el token del formulario público (invalida el enlace anterior). Solo FIRM_ADMIN. */
  @Roles(Role.FIRM_ADMIN)
  @Post('intake-token/rotate')
  rotateIntakeToken(@CurrentUser() user: RequestUser) {
    return this.leads.rotateIntakeToken(user);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.leads.get(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(user, id, dto);
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leads.convert(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.leads.remove(user, id);
  }
}
