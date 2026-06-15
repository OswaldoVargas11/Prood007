import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreatePortalUserDto } from './dto/create-portal-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Gestión de clientes. Solo abogados y administradores del despacho. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.clients.findAll(user, page, Math.min(pageSize, 100));
  }

  /** Comprobación de conflictos de interés por nombre (antes de dar de alta cliente/expediente). */
  @Get('conflict-check')
  conflictCheck(@CurrentUser() user: RequestUser, @Query('q') q: string) {
    return this.clients.conflictCheck(user, q ?? '');
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clients.findOne(user, id);
  }

  /** RGPD/Ley 172-13 — export de datos del titular (portabilidad). Solo FIRM_ADMIN. */
  @Roles(Role.FIRM_ADMIN)
  @Get(':id/gdpr-export')
  gdprExport(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clients.gdprExport(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.clients.remove(user, id);
  }

  /** Da acceso al portal al cliente (crea su usuario con rol CLIENT). */
  @Post(':id/portal-user')
  createPortalUser(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreatePortalUserDto,
  ) {
    return this.clients.createPortalUser(user, id, dto);
  }
}
