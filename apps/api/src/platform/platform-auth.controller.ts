import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';
import { PlatformLoginDto } from './dto/platform.dto';

const PLATFORM_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 h

/** Compara dos strings en tiempo constante (vía hash de longitud fija para no filtrar la longitud). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Login del SUPER-ADMIN de plataforma (dueño). Credenciales por entorno: `PLATFORM_ADMIN_EMAIL` +
 * `PLATFORM_ADMIN_PASSWORD` (en `fly secrets`). Emite un JWT con `platform: true` (sin tenantId).
 * Ruta pública (no es un usuario de despacho); la protege la propia validación de credenciales.
 */
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: PlatformLoginDto): Promise<{ accessToken: string; expiresIn: number }> {
    const email = this.config.get<string>('PLATFORM_ADMIN_EMAIL');
    const password = this.config.get<string>('PLATFORM_ADMIN_PASSWORD');
    if (!email || !password) {
      throw new BadRequestException(apiError('platform.notConfigured'));
    }
    const ok =
      safeEqual(dto.email.toLowerCase(), email.toLowerCase()) && safeEqual(dto.password, password);
    if (!ok) {
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    }
    const accessToken = await this.jwt.signAsync(
      { sub: email.toLowerCase(), platform: true },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: PLATFORM_TOKEN_TTL_SECONDS,
      },
    );
    return { accessToken, expiresIn: PLATFORM_TOKEN_TTL_SECONDS };
  }
}
