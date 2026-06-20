import { Module } from '@nestjs/common';
import { GoogleService } from './google.service';
import { MicrosoftService } from './microsoft.service';
import { MailService } from './mail.service';
import { IntegrationsController } from './integrations.controller';
import { GoogleCallbackController } from './google-callback.controller';
import { MicrosoftController } from './microsoft.controller';
import { MicrosoftCallbackController } from './microsoft-callback.controller';
import { MailController } from './mail.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [
    IntegrationsController,
    GoogleCallbackController,
    MicrosoftController,
    MicrosoftCallbackController,
    MailController,
  ],
  providers: [GoogleService, MicrosoftService, MailService],
})
export class IntegrationsModule {}
