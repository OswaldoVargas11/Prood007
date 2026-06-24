import { Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { UploadCertDto } from '../dgii/dto/upload-cert.dto';
import { VerifactuCredentialService } from './verifactu-credential.service';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite del .p12 (los certificados pesan unos KB). */
const MAX_CERT_BYTES = 512 * 1024;

/** Custodia del certificado de firma Verifactu (ES) del despacho. Autoservicio del FIRM_ADMIN. */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('verifactu')
export class VerifactuController {
  constructor(private readonly credentials: VerifactuCredentialService) {}

  /** Estado del certificado Verifactu del despacho. */
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.credentials.status(user.tenantId);
  }

  /** Sube el certificado .p12 de firma Verifactu (FNMT/representante). Solo admin. */
  @Roles(Role.FIRM_ADMIN)
  @Post('certificate')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CERT_BYTES } }))
  uploadCertificate(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadCertDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.credentials.upload(user.tenantId, file.buffer, dto.password, file.originalname);
  }
}
