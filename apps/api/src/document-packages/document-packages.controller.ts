import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { DocumentPackagesService } from './document-packages.service';
import { CreateDocumentPackageDto } from './dto/create-document-package.dto';

/** Paquetes de plantillas del despacho para ensamblar varios documentos a la vez. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('document-packages')
export class DocumentPackagesController {
  constructor(private readonly service: DocumentPackagesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDocumentPackageDto) {
    return this.service.create(user, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
