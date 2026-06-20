import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SystemPrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { apiError } from '../common/api-messages';
import type { MfaChallenge } from './auth.service';
import type { TokenPair } from './auth.types';

export type SocialProvider = 'google' | 'microsoft';

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string;
  requireVerified: boolean;
}

/** Resultado del callback: ticket de un solo uso (canjeable por sesión) o un código de error. */
export type CallbackResult = { ticket: string } | { error: string };

/**
 * Login social (Google/Microsoft). Reutiliza las apps OAuth ya configuradas, con scopes MÍNIMOS de
 * identidad (openid email). Solo autentica a usuarios que YA EXISTEN (emparejados por email VERIFICADO):
 * no crea cuentas (la asignación de despacho sería ambigua). La sesión se entrega con un ticket corto
 * de un solo uso para que el BFF del web ponga las cookies (sin tokens en la URL). Respeta MFA.
 */
@Injectable()
export class SocialAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly system: SystemPrismaService,
    private readonly tokens: TokensService,
  ) {}

  private get secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /** Config del proveedor derivada de la app OAuth ya existente; null si no está configurada. */
  private cfg(provider: SocialProvider): ProviderConfig | null {
    if (provider === 'google') {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
      const base = this.config.get<string>('GOOGLE_REDIRECT_URI');
      if (!clientId || !clientSecret || !base) return null;
      return {
        clientId,
        clientSecret,
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        redirectUri: `${new URL(base).origin}/api/auth/social/google/callback`,
        scope: 'openid email profile',
        requireVerified: true,
      };
    }
    const clientId = this.config.get<string>('MS_CLIENT_ID');
    const clientSecret = this.config.get<string>('MS_CLIENT_SECRET');
    const base = this.config.get<string>('MS_REDIRECT_URI');
    if (!clientId || !clientSecret || !base) return null;
    const tenant = this.config.get<string>('MS_TENANT') ?? 'common';
    return {
      clientId,
      clientSecret,
      authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      redirectUri: `${new URL(base).origin}/api/auth/social/microsoft/callback`,
      scope: 'openid email profile',
      requireVerified: false, // cuentas de organización: el correo viene verificado por el IdP
    };
  }

  /** Proveedores de login social habilitados (los muestra el front en el login). */
  providers() {
    return { google: this.cfg('google') !== null, microsoft: this.cfg('microsoft') !== null };
  }

  /** URL de consentimiento del proveedor (el navegador se redirige a ella). */
  async authUrl(provider: SocialProvider): Promise<string> {
    const c = this.cfg(provider);
    if (!c) throw new NotImplementedException(apiError('social.notConfigured'));
    const state = await this.jwt.signAsync(
      { typ: 'soc_state', p: provider },
      { secret: this.secret, expiresIn: 600 },
    );
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: c.scope,
      state,
      ...(provider === 'microsoft'
        ? { response_mode: 'query', prompt: 'select_account' }
        : { access_type: 'online', prompt: 'select_account' }),
    });
    return `${c.authUrl}?${params.toString()}`;
  }

  /** Intercambia el code, valida el correo y resuelve el usuario; devuelve ticket o error (no lanza). */
  async handleCallback(
    provider: SocialProvider,
    code: string,
    state: string,
  ): Promise<CallbackResult> {
    const c = this.cfg(provider);
    if (!c) return { error: 'not_configured' };
    try {
      const s = await this.jwt.verifyAsync<{ typ?: string; p?: string }>(state, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      if (s.typ !== 'soc_state' || s.p !== provider) return { error: 'state' };
    } catch {
      return { error: 'state' };
    }

    const res = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: c.redirectUri,
        grant_type: 'authorization_code',
        ...(provider === 'microsoft' ? { scope: c.scope } : {}),
      }),
    });
    if (!res.ok) return { error: 'exchange' };
    const tok = (await res.json()) as { id_token?: string };
    const claims = this.decodeIdToken(tok.id_token);
    const email = (claims.email ?? claims.preferred_username ?? claims.upn ?? '').toLowerCase();
    if (!email) return { error: 'no_email' };
    if (c.requireVerified && claims.email_verified !== true && claims.email_verified !== 'true') {
      return { error: 'unverified' };
    }

    const users = await this.system.user.findMany({
      where: { email, isActive: true },
      select: { id: true, tenantId: true },
    });
    if (users.length === 0) return { error: 'no_account' };
    if (users.length > 1) return { error: 'ambiguous' }; // mismo correo en varios despachos: usar contraseña

    const ticket = await this.jwt.signAsync(
      { sub: users[0]!.id, typ: 'soc_ticket' },
      { secret: this.secret, expiresIn: 60 },
    );
    return { ticket };
  }

  /** Canjea el ticket por una sesión (o un desafío MFA si el usuario tiene 2FA activada). */
  async exchangeTicket(ticket: string): Promise<TokenPair | MfaChallenge> {
    let userId: string;
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(ticket, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      if (p.typ !== 'soc_ticket' || !p.sub) throw new Error('bad ticket');
      userId = p.sub;
    } catch {
      throw new UnauthorizedException(apiError('social.invalidTicket'));
    }
    const u = await this.system.user.findUnique({
      where: { id: userId },
      select: { isActive: true, mfaEnabled: true },
    });
    if (!u || !u.isActive) throw new UnauthorizedException(apiError('auth.invalidCredentials'));
    if (u.mfaEnabled) {
      return { mfaRequired: true, mfaToken: await this.tokens.signMfaChallenge(userId) };
    }
    const userForToken = await this.tokens.loadUserForToken(userId);
    return this.tokens.issuePair(userForToken);
  }

  private decodeIdToken(idToken?: string): {
    email?: string;
    email_verified?: boolean | string;
    preferred_username?: string;
    upn?: string;
  } {
    if (!idToken) return {};
    try {
      return JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'));
    } catch {
      return {};
    }
  }
}
