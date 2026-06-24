import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { PresentationsService } from './presentations.service';
import { CreatePresentationTypeDto, UpdatePresentationTypeDto } from './dto/presentation-type.dto';
import { ApplyChecklistDto, UpdateChecklistItemDto } from './dto/checklist.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Catálogo de tipos de presentación del despacho (checklists de documentos). Staff del despacho. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('presentation-types')
export class PresentationTypesController {
  constructor(private readonly presentations: PresentationsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.presentations.listTypes(user);
  }

  /** Importa el catálogo de ejemplo (idempotente). Solo administrador. */
  @Post('seed')
  @Roles(Role.FIRM_ADMIN)
  seed(@CurrentUser() user: RequestUser) {
    return this.presentations.seedDefaults(user);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.presentations.getType(user, id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePresentationTypeDto) {
    return this.presentations.createType(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePresentationTypeDto,
  ) {
    return this.presentations.updateType(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.presentations.removeType(user, id);
  }
}

/** Checklists de presentación instanciadas sobre un expediente. Staff del despacho. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('presentation-checklists')
export class PresentationChecklistsController {
  constructor(private readonly presentations: PresentationsService) {}

  /** Checklists de un expediente: `?matterId=…`. */
  @Get()
  list(@CurrentUser() user: RequestUser, @Query('matterId') matterId: string) {
    return this.presentations.listForMatter(user, matterId);
  }

  /** Aplica un tipo de presentación a un expediente (instancia la checklist). */
  @Post()
  apply(@CurrentUser() user: RequestUser, @Body() dto: ApplyChecklistDto) {
    return this.presentations.applyToMatter(user, dto.matterId, dto.presentationTypeId);
  }

  /** Descarga el PDF del estado de la checklist (qué falta / qué está aportado). */
  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, buffer } = await this.presentations.checklistPdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** Actualiza un ítem (estado y/o documento aportado). */
  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.presentations.updateItem(user, itemId, dto);
  }

  /** Elimina una checklist del expediente. */
  @Delete(':id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('matterId') matterId: string,
  ) {
    return this.presentations.removeChecklist(user, matterId, id);
  }
}
