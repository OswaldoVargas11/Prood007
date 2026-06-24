import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FolderKind, Role } from '@legalflow/domain';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Carpetas (sistema de ficheros) de documentos y plantillas. Staff del despacho. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  /** Lista plana de carpetas de un contexto: `?kind=DOCUMENT&matterId=…` o `?kind=TEMPLATE`. */
  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query('kind') kind: FolderKind,
    @Query('matterId') matterId?: string,
  ) {
    return this.folders.list(user, kind, matterId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateFolderDto) {
    return this.folders.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.folders.remove(user, id);
  }
}
