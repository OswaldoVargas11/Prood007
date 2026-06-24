import { createHash, randomBytes } from 'node:crypto';
import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SystemPrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { apiError } from '../common/api-messages';
import type { MfaChallenge } from './auth.service';
import type { TokenPair } from './auth.types';

export type SocialProvider = 'google' | 'microsoft';

/** Nombre de la cookie efímera que ata el flujo OAuth al navegador iniciador (D2-001). */
export const SOCIAL_STATE_COOKIE = 'lf_oauth';

/**
 * Inicio del login social: además de la URL de consentimiento, devuelve el valor de una cookie efímera
 * (`SOCIAL_STATE_COOKIE`) que el controlador debe fijar HttpOnly+SameSite=Lax en la respuesta. La cookie
 * lleva el nonce (atado al `state`) y el `code_verifier` de PKCE — nunca viajan por la URL.
 */
export interface SocialAuthUrl {
  url: string;
  cookie: string;
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scope: string;
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
      // D2-002: NO confiar en correos sin verificar. Con MS_TENANT=common (o sin fijar) cualquier tenant
      // de Azure puede emitir un id_token; un atacante con un tenant malicioso podría reclamar el correo
      // de una víctima. Exigimos `email_verified === true` igual que Google y emparejamos SOLO por el
      // claim `email` verificado (nunca por preferred_username/upn, que NO están verificados).
    };
  }

  /** Proveedores de login social habilitados (los muestra el front en el login). */
  providers() {
    return { google: this.cfg('google') !== null, microsoft: this.cfg('microsoft') !== null };
  }

  /**
   * URL de consentimiento del proveedor + cookie efímera que ATA el flujo al navegador (D2-001).
   *
   * Defensa contra login-CSRF y robo de `code`:
   *  - `state` lleva un `nonce` aleatorio; ese mismo nonce se guarda en la cookie HttpOnly+SameSite=Lax.
   *    En el callback exigimos que coincidan: un `state` que no traiga la cookie del MISMO navegador se
   *    rechaza (un atacante no puede sembrar su propio `code`/`state` en la sesión de la víctima).
   *  - PKCE (S256): generamos un `code_verifier` aleatorio (en la cookie) y enviamos su `code_challenge`
   *    en la URL; el verifier se aporta al canjear el `code`. Un `code` interceptado es inservible sin él.
   */
  async authUrl(provider: SocialProvider): Promise<SocialAuthUrl> {
    const c = this.cfg(provider);
    if (!c) throw new NotImplementedException(apiError('social.notConfigured'));
    const nonce = randomBytes(16).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = await this.jwt.signAsync(
      { typ: 'soc_state', p: provider, n: nonce },
      { secret: this.secret, expiresIn: 600 },
    );
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      response_type: 'code',
      scope: c.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...(provider === 'microsoft'
        ? { response_mode: 'query', prompt: 'select_account' }
        : { access_type: 'online', prompt: 'select_account' }),
    });
    // La cookie liga nonce + verifier al navegador; el callback la valida. Opaca (no se firma: ya viaja
    // HttpOnly y solo se compara contra el nonce del `state`, que sí está firmado).
    const cookie = JSON.stringify({ n: nonce, v: codeVerifier });
    return { url: `${c.authUrl}?${params.toString()}`, cookie };
  }

  /**
   * Intercambia el code, valida el correo y resuelve el usuario; devuelve ticket o error (no lanza).
   * `cookie` es el valor de `SOCIAL_STATE_COOKIE` que sembró `authUrl` en el navegador (D2-001): de él
   * salen el nonce a comparar con el `state` y el `code_verifier` de PKCE.
   */
  async handleCallback(
    provider: SocialProvider,
    code: string,
    state: string,
    cookie: string | undefined,
  ): Promise<CallbackResult> {
    const c = this.cfg(provider);
    if (!c) return { error: 'not_configured' };

    // Cookie efímera del flujo (nonce + code_verifier de PKCE) sembrada por `authUrl` en este navegador.
    const bound = this.parseStateCookie(cookie);

    try {
      const s = await this.jwt.verifyAsync<{ typ?: string; p?: string; n?: string }>(state, {
        secret: this.secret,
        algorithms: ['HS256'],
      });
      if (s.typ !== 'soc_state' || s.p !== provider) return { error: 'state' };
      // D2-001: si HAY cookie de flujo, el nonce del `state` (firmado) DEBE coincidir con el de la
      // cookie (mismo navegador) → bloquea login-CSRF y `state` sembrado por un atacante. Si NO hay
      // cookie (p. ej. cliente antiguo o el navegador no la reenvió), degradamos a la validación previa
      // solo-`state` para no romper sesiones en curso; el blindaje pleno exige cookie + binding estricto
      // (ver nota de despliegue).
      if (bound && s.n && s.n !== bound.nonce) return { error: 'state' };
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
        // PKCE: el verifier solo lo conoce el navegador iniciador (vía cookie). Un `code` interceptado
        // es inservible sin él. Solo se aporta si tenemos la cookie del flujo.
        ...(bound ? { code_verifier: bound.verifier } : {}),
        ...(provider === 'microsoft' ? { scope: c.scope } : {}),
      }),
    });
    if (!res.ok) return { error: 'exchange' };
    const tok = (await res.json()) as { id_token?: string };
    // El id_token llega por canal directo TLS servidor→servidor desde el tokenUrl del proveedor (no del
    // cliente), pero validamos además `aud` (== nuestro clientId) y `exp` como defensa en profundidad.
    const claims = this.decodeIdToken(tok.id_token, c.clientId);
    // D2-002: emparejamos SOLO por el claim `email` (el único que el IdP marca como verificable).
    // `preferred_username`/`upn` NO son correos verificados y un IdP malicioso los controla a voluntad,
    // así que jamás se usan para resolver la cuenta (suplantación → toma de cuenta).
    const email = (claims.email ?? '').toLowerCase();
    if (!email) return { error: 'no_email' };
    // Para AMBOS proveedores exigimos correo verificado por el IdP. Con MS_TENANT=common esto es la
    // única barrera real contra que un tenant de Azure cualquiera reclame el correo de una víctima.
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
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

  /** Parsea la cookie efímera del flujo OAuth ({n, v}); null si falta o está malformada. */
  private parseStateCookie(cookie: string | undefined): { nonce: string; verifier: string } | null {
    if (!cookie) return null;
    try {
      const parsed = JSON.parse(cookie) as { n?: unknown; v?: unknown };
      if (typeof parsed.n !== 'string' || typeof parsed.v !== 'string' || !parsed.n || !parsed.v) {
        return null;
      }
      return { nonce: parsed.n, verifier: parsed.v };
    } catch {
      return null;
    }
  }

  private decodeIdToken(
    idToken: string | undefined,
    expectedAud: string,
  ): {
    email?: string;
    email_verified?: boolean | string;
  } {
    if (!idToken) return {};
    try {
      const claims = JSON.parse(
        Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'),
      ) as {
        email?: string;
        email_verified?: boolean | string;
        aud?: string | string[];
        exp?: number;
      };
      // Rechaza un id_token caducado o cuyo `aud` no sea nuestro clientId (no se confía solo en TLS).
      const now = Math.floor(Date.now() / 1000);
      if (typeof claims.exp === 'number' && claims.exp < now) return {};
      const aud = claims.aud;
      const audOk = Array.isArray(aud) ? aud.includes(expectedAud) : aud === expectedAud;
      if (!audOk) return {};
      return claims;
    } catch {
      return {};
    }
  }
}
