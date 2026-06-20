import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { apiError } from '../common/api-messages';

/**
 * Guard del SUPER-ADMIN de plataforma (dueño de Lawzora). Verifica un JWT firmado con
 * `JWT_ACCESS_SECRET` que lleva el claim `platform: true` (lo emite PlatformAuthController). Las rutas
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
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), algorithms: ['HS256'] },
      );
      if (payload.platform !== true) throw new Error('not platform');
      req.platformAdmin = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException(apiError('auth.invalidToken'));
    }
  }
}
