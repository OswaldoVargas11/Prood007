import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { SignaturesService } from './signatures.service';
import { RequestSignatureDto } from './dto/request-signature.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Post()
  request(@CurrentUser() user: RequestUser, @Body() dto: RequestSignatureDto) {
    return this.signatures.request(user, dto);
  }

  @Get('by-matter/:matterId')
  listByMatter(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.signatures.listByMatter(user, matterId);
  }

  @Get('by-document/:documentId')
  listByDocument(@CurrentUser() user: RequestUser, @Param('documentId') documentId: string) {
    return this.signatures.listByDocument(user, documentId);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.signatures.cancel(user, id);
  }
}
