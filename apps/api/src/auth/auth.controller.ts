import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@legalflow/domain';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

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

  /** Devuelve el usuario autenticado (requiere access token). */
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return user;
  }
}
