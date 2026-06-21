import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { EmailSnippetsService } from './email-snippets.service';
import { CreateEmailSnippetDto } from './dto/create-email-snippet.dto';

/** Plantillas de correo del despacho para respuestas recurrentes. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('email-snippets')
export class EmailSnippetsController {
  constructor(private readonly service: EmailSnippetsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEmailSnippetDto) {
    return this.service.create(user, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
