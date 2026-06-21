import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@legalflow/domain';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { DgiiConfig } from './dgii.config';
import { DgiiCredentialService } from './dgii-credential.service';
import { EcfTransmissionService } from './ecf-transmission.service';
import { UploadCertDto } from './dto/upload-cert.dto';

interface MulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite del .p12 (los certificados pesan unos KB). */
const MAX_CERT_BYTES = 512 * 1024;

/** Configuración y operativa de la transmisión de e-CF a la DGII (RD). */
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('dgii')
export class DgiiController {
  constructor(
    private readonly config: DgiiConfig,
    private readonly credentials: DgiiCredentialService,
    private readonly transmission: EcfTransmissionService,
  ) {}

  /** ¿Transmisión activada en el servidor? + estado del certificado del despacho. */
  @Get('status')
  async status(@CurrentUser() user: RequestUser) {
    return {
      enabled: this.config.enabled,
      environment: this.config.enabled ? this.config.env : null,
      certificate: await this.credentials.status(user.tenantId),
    };
  }

  /** Sube el certificado .p12 del despacho (solo admin). Valida que abre con la contraseña. */
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

  /** Firma y transmite el e-CF de una factura a la DGII (o lo deja STUBBED si está apagado). */
  @Post('invoices/:id/transmit')
  transmit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transmission.transmit(user.tenantId, id);
  }

  /** Consulta el acuse/estado en la DGII por el TrackId y actualiza la factura. */
  @Post('invoices/:id/refresh')
  refresh(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.transmission.refresh(user.tenantId, id);
  }
}
