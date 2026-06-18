import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformGuard } from './platform.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PlatformAuthController, PlatformController],
  providers: [PlatformService, PlatformGuard],
})
export class PlatformModule {}
