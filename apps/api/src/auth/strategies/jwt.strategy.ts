import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SystemPrismaService } from '../../prisma/prisma.service';
import { apiError } from '../../common/api-messages';
import type { AccessTokenPayload, RequestUser } from '../auth.types';

/**
 * Valida el access token (Bearer) y construye el RequestUser.
 *
 * SEC4 — corte duro de sesión: además de verificar firma/expiración del JWT, hace una lectura mínima
 * a BD (vía `SystemPrismaService`, rol BYPASSRLS, porque esta ruta no tiene contexto de tenant) para:
 *   - rechazar usuarios inactivos de inmediato (sin esperar a que caduque el access);
 *   - rechazar tokens "viejos": emitidos ANTES del último cambio de contraseña (`passwordChangedAt`),
 *     invalidándolos al instante en cambio/reset de clave;
 *   - exponer `mustChangePassword` en el RequestUser (lo consume p. ej. GET /auth/me).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly system: SystemPrismaService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET no está configurado.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    if (!payload?.sub || !payload?.tid) {
      throw new UnauthorizedException(apiError('auth.invalidToken'));
    }

    const user = await this.system.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, passwordChangedAt: true, mustChangePassword: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(apiError('auth.invalidUser'));
    }

    // Corte por cambio de clave: si el token se emitió antes del último cambio, ya no vale.
    // `iat` viene en segundos; `passwordChangedAt` en ms. Se compara con margen de 1s para evitar
    // falsos positivos por el truncado a segundos del `iat`.
    if (payload.iat != null && user.passwordChangedAt) {
      const issuedAtMs = payload.iat * 1000;
      if (issuedAtMs + 1000 <= user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException(apiError('auth.tokenStale'));
      }
    }

    return {
      userId: payload.sub,
      tenantId: payload.tid,
      jurisdiction: payload.jur,
      email: payload.email,
      roles: payload.roles ?? [],
      mustChangePassword: user.mustChangePassword,
    };
  }
}
