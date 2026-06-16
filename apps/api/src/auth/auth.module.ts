import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { PasswordResetService } from './password-reset.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MAIL_PROVIDER, NoopMailProvider } from './mail/mail.provider';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    PasswordResetService,
    JwtStrategy,
    // Proveedor de correo: stub por defecto (no envía). Sustituible por SMTP/Resend bajo el token.
    { provide: MAIL_PROVIDER, useClass: NoopMailProvider },
    // Guards globales: autenticación por defecto (salvo @Public) + control de roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
