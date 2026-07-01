import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { ClosingService } from './closing.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

/**
 * Checklist de cierre transaccional (condiciones previas, entregables, hojas de firma) y generación del
 * closing binder. Solo staff del despacho; acotado al tenant por RLS + verificación de expediente.
 */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('closing')
@Controller('closing')
export class ClosingController {
  constructor(private readonly service: ClosingService) {}

  // Rutas estáticas antes que las paramétricas (Express casa por orden de declaración).
  @Get('templates')
  templates() {
    return this.service.templates();
  }

  @Get('by-matter/:matterId')
  listByMatter(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.listByMatter(user, matterId);
  }

  // Readiness agregada de la operación (CPs por fase) para el aviso de gating al firmar/cerrar.
  @Get('by-matter/:matterId/readiness')
  matterReadiness(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.matterReadiness(user, matterId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateChecklistDto) {
    return this.service.create(user, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: RequestUser,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.service.updateItem(user, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(@CurrentUser() user: RequestUser, @Param('itemId') itemId: string) {
    return this.service.removeItem(user, itemId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.getOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateChecklistDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Post(':id/items')
  addItem(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateItemDto) {
    return this.service.addItem(user, id, dto);
  }

  @Get(':id/binder')
  async binder(@CurrentUser() user: RequestUser, @Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.service.buildBinder(user, id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
