import { Module } from '@nestjs/common';
import { GoogleService } from './google.service';
import { IntegrationsController } from './integrations.controller';
import { GoogleCallbackController } from './google-callback.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController, GoogleCallbackController],
  providers: [GoogleService],
})
export class IntegrationsModule {}
