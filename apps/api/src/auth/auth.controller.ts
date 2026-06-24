import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@legalflow/domain';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { MfaService } from './mfa.service';
import { MfaCodeDto, MfaLoginDto } from './dto/mfa.dto';
import { SocialAuthService, SOCIAL_STATE_COOKIE, type SocialProvider } from './social-auth.service';
import { SocialExchangeDto } from './dto/social.dto';
import { EmailVerificationService } from './email-verification.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AllowExpired } from '../subscription/allow-expired.decorator';
import type { RequestUser } from './auth.types';

// Rutas de sesión accesibles aunque la prueba haya caducado (login/me/logout/refresh): sin esto, un
// despacho con prueba expirada no podría ni cargar la sesión para llegar al muro de suscripción.
@AllowExpired()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly mfa: MfaService,
    private readonly social: SocialAuthService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  // ── Verificación de email (anti-bots) ────────────────────────────────────────
  /** Confirma el email a partir del token del correo. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerification.verify(dto.token);
  }

  /** Reenvía el correo de verificación al usuario autenticado (si aún no está verificado). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  resendVerification(@CurrentUser() user: RequestUser) {
    return this.emailVerification.resend(user);
  }

  // ── Login social (Google/Microsoft) ─────────────────────────────────────────
  /** Proveedores de login social habilitados en el servidor (para mostrar los botones). */
  @Public()
  @Get('social/providers')
  socialProviders() {
    return this.social.providers();
  }

  /** Inicia el login social: redirige al consentimiento del proveedor. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('social/:provider')
  async socialStart(@Param('provider') provider: string, @Res() res: Response) {
    if (provider !== 'google' && provider !== 'microsoft') {
      return res.redirect(`${this.webBase()}/es/login?social_error=provider`);
    }
    const { url, cookie } = await this.social.authUrl(provider as SocialProvider);
    // D2-001: cookie efímera que ATA el flujo a ESTE navegador (nonce + code_verifier de PKCE).
    // HttpOnly (el JS de cliente no la ve), SameSite=Lax (viaja en el redirect de vuelta del IdP,
    // que es una navegación GET de nivel superior) y vida corta (10 min, igual que el `state`).
    res.cookie(SOCIAL_STATE_COOKIE, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth/social',
      maxAge: 600_000,
    });
    return res.redirect(url);
  }

  /** Callback del proveedor: resuelve el usuario y redirige al web con un ticket de un solo uso. */
  @Public()
  @Get('social/:provider/callback')
  async socialCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res() res: Response,
  ) {
    const web = this.webBase();
    // La cookie del flujo se consume aquí (un solo uso), pase lo que pase con la validación.
    res.clearCookie(SOCIAL_STATE_COOKIE, { path: '/api/auth/social' });
    if ((provider !== 'google' && provider !== 'microsoft') || !code || !state) {
      return res.redirect(`${web}/es/login?social_error=callback`);
    }
    // Extraemos el valor de la cookie del flujo del header crudo (la API no monta cookie-parser).
    const cookie = this.readCookie(cookieHeader, SOCIAL_STATE_COOKIE);
    const result = await this.social.handleCallback(
      provider as SocialProvider,
      code,
      state,
      cookie,
    );
    if ('error' in result) return res.redirect(`${web}/es/login?social_error=${result.error}`);
    return res.redirect(`${web}/es/login?social_ticket=${result.ticket}`);
  }

  /** Lee una cookie por nombre del header `Cookie` crudo (la API no registra cookie-parser). */
  private readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      if (part.slice(0, idx).trim() === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return undefined;
  }

  /** Canjea el ticket de un solo uso por una sesión (lo llama el BFF del web). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('social/exchange')
  socialExchange(@Body() dto: SocialExchangeDto) {
    return this.social.exchangeTicket(dto.ticket);
  }

  private webBase(): string {
    return process.env.APP_PUBLIC_URL ?? 'https://lawzora.com';
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register-tenant')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.auth.registerTenant(dto);
  }

  // Límite estricto contra fuerza bruta de credenciales.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Segundo paso del login cuando el usuario tiene MFA: token de desafío + código. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/login')
  mfaLogin(@Body() dto: MfaLoginDto) {
    return this.auth.mfaLogin(dto.mfaToken, dto.code);
  }

  /** Estado de MFA del usuario (¿activado?). */
  @Get('mfa/status')
  mfaStatus(@CurrentUser() user: RequestUser) {
    return this.mfa.status(user);
  }

  /** Inicia el alta de MFA: genera secreto + QR (aún no activa). */
  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: RequestUser) {
    return this.mfa.setup(user);
  }

  /** Confirma el código y activa MFA; devuelve los códigos de respaldo (una sola vez). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/enable')
  mfaEnable(@CurrentUser() user: RequestUser, @Body() dto: MfaCodeDto) {
    return this.mfa.enable(user, dto.code);
  }

  /** Desactiva MFA tras verificar un código (TOTP o de respaldo). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/disable')
  mfaDisable(@CurrentUser() user: RequestUser, @Body() dto: MfaCodeDto) {
    return this.mfa.disable(user, dto.code);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  /**
   * Cambio de contraseña self-service (requiere access token). Re-autentica con la actual, cierra el
   * resto de sesiones y devuelve un par nuevo para el dispositivo actual. Límite estricto contra
   * fuerza bruta de la contraseña actual.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  /**
   * Reset por ADMIN del despacho: genera un enlace de un solo uso para un usuario del mismo despacho
   * (staff o cliente de portal). El admin entrega el enlace al usuario. Solo FIRM_ADMIN.
   */
  @Roles(Role.FIRM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post('admin/reset-password/:userId')
  adminResetPassword(@CurrentUser() actor: RequestUser, @Param('userId') userId: string) {
    return this.passwordReset.adminCreateReset(actor, userId);
  }

  /**
   * Autoservicio "olvidé mi contraseña": SIEMPRE responde 200 genérico (no revela si el email existe).
   * Si procede, delega el envío del enlace al MailProvider. Límite estricto contra abuso.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordReset.forgotPassword(dto.email);
    return { success: true };
  }

  /** Aplica un token de restablecimiento con una nueva contraseña. Cierra todas las sesiones. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.newPassword);
  }

  /** Devuelve el usuario autenticado + su despacho (id y nombre, para el header). */
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getProfile(user);
  }
}
