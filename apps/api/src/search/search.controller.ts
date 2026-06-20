import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SearchService } from './search.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Búsqueda global del despacho (staff). El portal de cliente no la usa. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  query(@CurrentUser() user: RequestUser, @Query('q') q: string) {
    return this.search.search(user, q ?? '');
  }
}
