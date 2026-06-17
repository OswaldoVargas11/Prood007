import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { GenerateFromTemplateDto } from './dto/generate-from-template.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

// Tipo mínimo del archivo subido por Multer (evita depender del namespace global).
interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite de tamaño de subida: 25 MB. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.documents.upload(user, dto.matterId, dto.name, file);
  }

  @Post(':id/versions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  addVersion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ) {
    return this.documents.addVersion(user, id, file);
  }

  /** Genera un documento en el expediente a partir de una plantilla (campos combinados). */
  @Post('from-template')
  generateFromTemplate(@CurrentUser() user: RequestUser, @Body() dto: GenerateFromTemplateDto) {
    return this.documents.generateFromTemplate(user, dto);
  }

  @Get('by-matter/:matterId')
  listByMatter(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.documents.listByMatter(user, matterId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.documents.getOne(user, id);
  }

  @Get('versions/:versionId/download')
  async download(
    @CurrentUser() user: RequestUser,
    @Param('versionId') versionId: string,
    @Res() res: Response,
  ) {
    const { version, buffer } = await this.documents.download(user, versionId);
    res.setHeader('Content-Type', version.mimeType);
    res.setHeader('Content-Length', String(version.sizeBytes));
    res.send(buffer);
  }

  @Post('versions/:versionId/review')
  review(
    @CurrentUser() user: RequestUser,
    @Param('versionId') versionId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documents.review(user, versionId, dto.status, dto.comment);
  }
}
