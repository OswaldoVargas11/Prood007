import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { apiError } from '../common/api-messages';
import { platformJwtSecret } from './platform-secret';
import { PLATFORM_TOKEN_AUDIENCE } from './platform-auth.controller';

/**
 * Guard del SUPER-ADMIN de plataforma (dueño de Lawzora). Verifica un JWT firmado con el secreto
 * dedicado de plataforma (`platformJwtSecret`) que lleva el claim `platform: true` (lo emite
 * PlatformAuthController). Las rutas
 * de plataforma son `@Public` (saltan el guard de tenant) y NO llevan tenantId: operan cross-tenant
 * vía el rol de sistema (BYPASSRLS). Distinto del FIRM_ADMIN de un despacho.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { platformAdmin?: string }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException(apiError('auth.notAuthenticated'));
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; platform?: boolean }>(
        header.slice(7),
        {
          secret: platformJwtSecret(this.config),
          algorithms: ['HS256'],
          // Audiencia DEDICADA: discriminador extra junto a `platform: true`. jwt.verify rechaza el token
          // si `aud` no coincide, de modo que un token sin esta audiencia no pasa el guard.
          audience: PLATFORM_TOKEN_AUDIENCE,
        },
      );
      if (payload.platform !== true) throw new Error('not platform');
      req.platformAdmin = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException(apiError('auth.invalidToken'));
    }
  }
}
