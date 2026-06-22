import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { ClausesService } from './clauses.service';
import { CreateClauseDto } from './dto/create-clause.dto';

/** Biblioteca de cláusulas del despacho para ensamblar plantillas/documentos. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('clauses')
@Controller('clauses')
export class ClausesController {
  constructor(private readonly service: ClausesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateClauseDto) {
    return this.service.create(user, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
