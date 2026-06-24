import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';
import { platformJwtSecret } from './platform-secret';
import { PlatformLoginDto } from './dto/platform.dto';

// TTL del token de plataforma: 1 h (D3-003). Es una credencial de máximo privilegio (cross-tenant,
// BYPASSRLS); una ventana corta limita el daño de un token filtrado. Override por entorno si hiciera falta.
const PLATFORM_TOKEN_TTL_SECONDS = Number(process.env.PLATFORM_TOKEN_TTL_SECONDS) || 60 * 60; // 1 h
// `aud` dedicado del token de plataforma: discriminador EXTRA junto a `platform: true`. El guard exige
// esta audiencia, de modo que un token de usuario (mismo no aplica: secreto distinto) tampoco encajaría.
export const PLATFORM_TOKEN_AUDIENCE = 'platform';
// Lockout in-memory del super-admin (además del @Throttle 5/min): tras N fallos por IP se bloquea un rato.
// Una sola credencial que concede control de plataforma merece freno + alerta propios, no solo el throttle.
const PLATFORM_MAX_FAILS = 8;
const PLATFORM_LOCK_MS = 15 * 60 * 1000; // 15 min

/** Comparación en tiempo constante (sin hashear): guarda de longitud + timingSafeEqual sobre bytes. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Login del SUPER-ADMIN de plataforma (dueño). Credenciales por entorno: `PLATFORM_ADMIN_EMAIL` +
 * `PLATFORM_ADMIN_PASSWORD` (en `fly secrets`). Emite un JWT con `platform: true` (sin tenantId) firmado
 * con un secreto DEDICADO (`PLATFORM_JWT_SECRET`, fallback a `JWT_ACCESS_SECRET`) para aislarlo de los
 * tokens de usuario. Ruta pública; la protegen la validación de credenciales + throttle + lockout.
 */
@Controller('platform/auth')
export class PlatformAuthController {
  private readonly logger = new Logger('PlatformAuth');
  // IP → estado de fuerza bruta. In-memory (coherente con el throttler); single-instance en prod.
  private readonly attempts = new Map<string, { fails: number; lockedUntil: number }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Rate-limit ESTRICTO: el super-admin concede control de plataforma; 5 intentos/min por IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Public()
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: PlatformLoginDto,
    @Req() req: Request,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const state = this.attempts.get(ip);
    if (state && state.lockedUntil > now) {
      this.logger.warn(`Login de plataforma BLOQUEADO (ip=${ip}); intento durante el lockout.`);
      throw new UnauthorizedException(apiError('auth.accountLocked'));
    }

    const email = this.config.get<string>('PLATFORM_ADMIN_EMAIL');
    const password = this.config.get<string>('PLATFORM_ADMIN_PASSWORD');
    if (!email || !password) {
      throw new BadRequestException(apiError('platform.notConfigured'));
    }
    const ok =
      safeEqual(dto.email.toLowerCase(), email.toLowerCase()) && safeEqual(dto.password, password);
    if (!ok) {
      const fails = (state?.fails ?? 0) + 1;
      const locks = fails >= PLATFORM_MAX_FAILS;
      this.attempts.set(ip, {
        fails: locks ? 0 : fails,
        lockedUntil: locks ? now + PLATFORM_LOCK_MS : 0,
      });
      // Evento de seguridad: el login del super-admin es de alto valor → siempre se registra a nivel warn
      // (lo recoge pino/Sentry para alertar). NOTA: AuditLog.tenantId es NOT NULL + FK a Tenant y el login
      // de plataforma NO tiene tenant destino (ni existe un tenant sentinela), por lo que `platform.login_*`
      // no puede persistirse como fila de auditoría sin forjar una FK inválida; queda como log estructurado
      // (pino/Sentry) con el action canónico + IP, que es la traza auditable para eventos sin tenant.
      this.logger.warn(
        `platform.login_failed (ip=${ip}, intentos=${fails}${locks ? ', LOCKOUT 15min' : ''}).`,
      );
      throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    }

    this.attempts.delete(ip);
    this.logger.log(`platform.login_success (ip=${ip}).`);
    const accessToken = await this.jwt.signAsync(
      { sub: email.toLowerCase(), platform: true },
      {
        secret: platformJwtSecret(this.config),
        audience: PLATFORM_TOKEN_AUDIENCE,
        expiresIn: PLATFORM_TOKEN_TTL_SECONDS,
      },
    );
    return { accessToken, expiresIn: PLATFORM_TOKEN_TTL_SECONDS };
  }
}
