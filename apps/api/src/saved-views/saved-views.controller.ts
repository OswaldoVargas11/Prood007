import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { SavedViewsService } from './saved-views.service';
import {
  CreateSavedViewDto,
  SAVED_VIEW_SCOPES,
  type SavedViewScope,
} from './dto/create-saved-view.dto';

/** Vistas guardadas del usuario (presets de filtros) por ámbito: facturas / tareas / expedientes. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query('scope') scope?: string) {
    const s = (SAVED_VIEW_SCOPES as readonly string[]).includes(scope ?? '')
      ? (scope as SavedViewScope)
      : 'invoices';
    return this.service.list(user, s);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSavedViewDto) {
    return this.service.create(user, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
