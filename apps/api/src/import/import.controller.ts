import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { ImportService } from './import.service';
import { ImportClientsDto } from './dto/import-clients.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Importación/migración de datos del despacho (CSV). Solo administradores. */
@Roles(Role.FIRM_ADMIN)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /** Dry-run: valida el CSV de clientes y devuelve el detalle por fila. No escribe nada. */
  @Post('clients/preview')
  previewClients(@CurrentUser() user: RequestUser, @Body() dto: ImportClientsDto) {
    return this.importService.previewClients(user, dto.csv);
  }

  /** Crea los clientes válidos no duplicados del CSV. */
  @Post('clients/commit')
  commitClients(@CurrentUser() user: RequestUser, @Body() dto: ImportClientsDto) {
    return this.importService.commitClients(user, dto.csv);
  }
}
