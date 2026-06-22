import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { EngagementService } from './engagement.service';
import { SaveEngagementLetterDto } from './dto/save-engagement-letter.dto';

/** Hoja de encargo del expediente (intake). Solo staff; acotado al tenant por RLS. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('engagement')
@Controller('engagement-letters')
export class EngagementController {
  constructor(private readonly service: EngagementService) {}

  @Get('by-matter/:matterId')
  getByMatter(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.getByMatter(user, matterId);
  }

  @Post()
  save(@CurrentUser() user: RequestUser, @Body() dto: SaveEngagementLetterDto) {
    return this.service.save(user, dto);
  }
}
