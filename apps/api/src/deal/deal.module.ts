import { Module } from '@nestjs/common';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';
import { DealMilestoneRemindersService } from './milestone-reminders.service';
import { DealMilestonesCron } from './milestone-reminders.cron';

@Module({
  controllers: [DealController],
  providers: [DealService, DealMilestoneRemindersService, DealMilestonesCron],
  exports: [DealService, DealMilestoneRemindersService],
})
export class DealModule {}
