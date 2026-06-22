import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { PasswordResetService } from './password-reset.service';
import { HibpService } from './hibp.service';
import { MfaService } from './mfa.service';
import { SocialAuthService } from './social-auth.service';
import { EmailVerificationService } from './email-verification.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { EntitlementsGuard } from './guards/entitlements.guard';
import { MAIL_PROVIDER, type MailProvider, NoopMailProvider } from './mail/mail.provider';
import { SmtpMailProvider } from './mail/smtp-mail.provider';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    PasswordResetService,
    HibpService,
    MfaService,
    SocialAuthService,
    EmailVerificationService,
    JwtStrategy,
    // Proveedor de correo elegido en runtime: si SMTP_HOST está configurado → SMTP real; si no, el
    // stub Noop (dev/CI no necesitan SMTP). El transporte SMTP es perezoso, no conecta en el arranque.
    {
      provide: MAIL_PROVIDER,
      useFactory: (config: ConfigService): MailProvider => {
        const host = config.get<string>('SMTP_HOST');
        if (host) {
          new Logger('AuthModule').log(`Correo transaccional vía SMTP (${host}).`);
          return new SmtpMailProvider(config);
        }
        new Logger('AuthModule').log(
          'Correo transaccional deshabilitado (sin SMTP_HOST): NoopMailProvider.',
        );
        return new NoopMailProvider();
      },
      inject: [ConfigService],
    },
    // Guards globales: autenticación por defecto (salvo @Public) + control de roles + gating por tier.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: EntitlementsGuard },
  ],
  exports: [AuthService, TokensService, PasswordResetService, HibpService, MAIL_PROVIDER],
})
export class AuthModule {}
