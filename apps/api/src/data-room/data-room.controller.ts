import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { safeContentDisposition } from '../common/safe-download';
import type { RequestUser } from '../auth/auth.types';
import { DataRoomService } from './data-room.service';
import {
  AnswerQuestionDto,
  CreateDataRoomDto,
  CreateFolderDto,
  CreateGrantDto,
  CreateGroupDto,
  LinkDocumentDto,
  UpdateDataRoomDto,
  UpdateGroupDto,
  UploadDataRoomDocumentDto,
} from './dto/data-room.dto';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Gestión INTERNA del data room (staff del despacho). Acotado al tenant por RLS. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@RequiresFeature('data-room')
@Controller('data-rooms')
export class DataRoomController {
  constructor(private readonly service: DataRoomService) {}

  @Get('by-matter/:matterId')
  listByMatter(@CurrentUser() user: RequestUser, @Param('matterId') matterId: string) {
    return this.service.listByMatter(user, matterId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateDataRoomDto) {
    return this.service.create(user, dto);
  }

  @Delete('folders/:folderId')
  removeFolder(@CurrentUser() user: RequestUser, @Param('folderId') folderId: string) {
    return this.service.removeFolder(user, folderId);
  }

  @Delete('documents/:docId')
  removeDocument(@CurrentUser() user: RequestUser, @Param('docId') docId: string) {
    return this.service.removeDocument(user, docId);
  }

  @Get('documents/:docId/download')
  async download(
    @CurrentUser() user: RequestUser,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const { name, mimeType, buffer } = await this.service.downloadInternal(user, docId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', safeContentDisposition(mimeType, name));
    res.send(buffer);
  }

  @Delete('grants/:grantId')
  revokeGrant(@CurrentUser() user: RequestUser, @Param('grantId') grantId: string) {
    return this.service.revokeGrant(user, grantId);
  }

  @Patch('groups/:groupId')
  updateGroup(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.service.updateGroup(user, groupId, dto);
  }

  @Delete('groups/:groupId')
  removeGroup(@CurrentUser() user: RequestUser, @Param('groupId') groupId: string) {
    return this.service.removeGroup(user, groupId);
  }

  @Post('questions/:questionId/answer')
  answerQuestion(
    @CurrentUser() user: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: AnswerQuestionDto,
  ) {
    return this.service.answerQuestion(user, questionId, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.getOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateDataRoomDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Post(':id/folders')
  addFolder(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.service.addFolder(user, id, dto);
  }

  @Post(':id/documents/link')
  linkDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: LinkDocumentDto,
  ) {
    return this.service.linkDocument(user, id, dto);
  }

  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadDocument(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: UploadDataRoomDocumentDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.service.uploadDocument(user, id, body.folderId, body.name, file);
  }

  @Post(':id/groups')
  addGroup(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CreateGroupDto) {
    return this.service.addGroup(user, id, dto);
  }

  @Post(':id/grants')
  createGrant(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateGrantDto,
  ) {
    return this.service.createGrant(user, id, dto);
  }

  @Get(':id/access-log')
  accessLog(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.listAccessLog(user, id);
  }

  @Get(':id/questions')
  questions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.listQuestions(user, id);
  }
}
