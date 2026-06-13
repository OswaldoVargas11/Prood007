import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Jurisdiction } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  RequestUser,
  TokenPair,
} from './auth.types';

interface UserForToken {
  id: string;
  tenantId: string;
  email: string;
  jurisdiction: Jurisdiction;
  roles: string[];
}

const ACCESS_TTL_SECONDS = 15 * 60; // 15 min
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private get accessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private get refreshSecret(): string {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  /** Emite un par access+refresh para el usuario, persistiendo el refresh hasheado. */
  async issuePair(user: UserForToken): Promise<TokenPair> {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user);
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: ACCESS_TTL_SECONDS };
  }

  private signAccessToken(user: UserForToken): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      tid: user.tenantId,
      jur: user.jurisdiction,
      email: user.email,
      roles: user.roles,
    };
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: ACCESS_TTL_SECONDS,
    });
  }

  /** Crea una fila RefreshToken y devuelve el JWT de refresco (con jti = id de la fila). */
  private async createRefreshToken(user: UserForToken): Promise<string> {
    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const payload: RefreshTokenPayload = { sub: user.id, tid: user.tenantId, jti: row.id };
    const token = await this.jwt.signAsync(payload, {
      secret: this.refreshSecret,
      expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
    });
    // Guardamos el hash del token firmado para poder detectar reutilización.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { tokenHash: this.sha256(token) },
    });
    return token;
  }

  /**
   * Rota un refresh token: verifica firma+expiración, comprueba que la fila no esté revocada y
   * que el hash coincida; revoca la fila y emite un par nuevo. Si se detecta reutilización de un
   * token ya revocado, revoca TODAS las sesiones del usuario (mitigación de robo).
   */
  async rotate(presentedToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(presentedToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado.');
    }

    const row = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (!row || row.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token desconocido.');
    }

    const presentedHash = this.sha256(presentedToken);
    if (row.revokedAt || row.tokenHash !== presentedHash) {
      // Reutilización de un token revocado o manipulado → revocar todo el usuario.
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reutilizado; sesiones revocadas.');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    // Cargar datos frescos del usuario (roles/estado pueden haber cambiado).
    const user = await this.loadUserForToken(row.userId);

    // Revocar el token presentado y emitir uno nuevo (rotación).
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issuePair(user);
  }

  /** Revoca un refresh token concreto (logout). No falla si ya no es válido. */
  async revoke(presentedToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(presentedToken, {
        secret: this.refreshSecret,
      });
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Token ya inválido: logout idempotente.
    }
  }

  /** Carga usuario + roles + jurisdicción del tenant, en forma lista para firmar tokens. */
  async loadUserForToken(userId: string): Promise<UserForToken> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, tenant: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario no válido.');
    }
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      jurisdiction: user.tenant.jurisdiction as Jurisdiction,
      roles: user.roles.map((ur) => ur.role.code),
    };
  }

  /** Helper para construir un RequestUser a partir de un UserForToken (tests/uso interno). */
  toRequestUser(user: UserForToken): RequestUser {
    return {
      userId: user.id,
      tenantId: user.tenantId,
      jurisdiction: user.jurisdiction,
      email: user.email,
      roles: user.roles,
    };
  }
}
