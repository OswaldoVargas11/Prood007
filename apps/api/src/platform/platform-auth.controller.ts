import { timingSafeEqual } from 'node:crypto';
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
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';
import { PlatformLoginDto } from './dto/platform.dto';

const PLATFORM_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 h

/** Comparación en tiempo constante (sin hashear): guarda de longitud + timingSafeEqual sobre bytes. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
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

  // Rate-limit ESTRICTO: el super-admin concede control de plataforma; 5 intentos/min por IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
