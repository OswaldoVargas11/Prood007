import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@legalflow/domain';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AddHolidayDto } from './dto/add-holiday.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Ajustes del despacho. Solo el administrador del despacho. */
@Roles(Role.FIRM_ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: RequestUser) {
    return this.settings.get(user);
  }

  @Patch()
  update(@CurrentUser() user: RequestUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(user, dto);
  }

  @Post('holidays')
  addHoliday(@CurrentUser() user: RequestUser, @Body() dto: AddHolidayDto) {
    return this.settings.addHoliday(user, dto);
  }

  @Delete('holidays/:date')
  removeHoliday(@CurrentUser() user: RequestUser, @Param('date') date: string) {
    return this.settings.removeHoliday(user, date);
  }

  @Post('certificate')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadCertificate(@CurrentUser() user: RequestUser, @UploadedFile() file: MulterFile) {
    return this.settings.uploadCertificate(user, file);
  }
}
