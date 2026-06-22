import { Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { MicrosoftService } from './microsoft.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Conexión Microsoft 365 (OAuth) y push de agenda a Outlook Calendar. Correo: /integrations/mail. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('integrations')
@Controller('integrations/microsoft')
export class MicrosoftController {
  constructor(private readonly microsoft: MicrosoftService) {}

  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.microsoft.status(user);
  }

  @Get('connect')
  connect(@CurrentUser() user: RequestUser) {
    return this.microsoft.authUrl(user);
  }

  @Delete()
  disconnect(@CurrentUser() user: RequestUser) {
    return this.microsoft.disconnect(user);
  }

  /** Empuja los plazos del despacho al Outlook Calendar del usuario (Lawzora → Microsoft). */
  @Post('calendar/sync')
  syncCalendar(@CurrentUser() user: RequestUser) {
    return this.microsoft.syncCalendar(user);
  }

  /** ¿Configurado/conectado para importar ficheros? (el front muestra/oculta el explorador). */
  @Get('files/status')
  filesStatus(@CurrentUser() user: RequestUser) {
    return this.microsoft.filesStatus(user);
  }

  /** Lista carpetas+ficheros de OneDrive (raíz si no hay driveId) o de una unidad de SharePoint. */
  @Get('files')
  listFiles(
    @CurrentUser() user: RequestUser,
    @Query('driveId') driveId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.microsoft.listFiles(user, { driveId, itemId });
  }

  /** Busca sitios de SharePoint por texto (devuelve la unidad de documentos de cada uno). */
  @Get('sites')
  searchSites(@CurrentUser() user: RequestUser, @Query('q') q?: string) {
    return this.microsoft.searchSites(user, q ?? '');
  }
}
