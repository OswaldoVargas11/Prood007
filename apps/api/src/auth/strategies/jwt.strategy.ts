import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { apiError } from '../../common/api-messages';
import type { AccessTokenPayload, RequestUser } from '../auth.types';

/** Valida el access token (Bearer) y construye el RequestUser sin tocar la BD. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
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

  validate(payload: AccessTokenPayload): RequestUser {
    if (!payload?.sub || !payload?.tid) {
      throw new UnauthorizedException(apiError('auth.invalidToken'));
    }
    return {
      userId: payload.sub,
      tenantId: payload.tid,
      jurisdiction: payload.jur,
      email: payload.email,
      roles: payload.roles ?? [],
    };
  }
}
