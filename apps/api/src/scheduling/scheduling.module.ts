import { Module } from '@nestjs/common';
import { SchedulingController } from './scheduling.controller';
import { PortalSchedulingController } from './portal-scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  controllers: [SchedulingController, PortalSchedulingController],
  providers: [SchedulingService],
})
export class SchedulingModule {}
