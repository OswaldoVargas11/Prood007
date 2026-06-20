import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { CalendarFeedController } from './calendar-feed.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CalendarController, CalendarFeedController],
  providers: [CalendarService],
})
export class CalendarModule {}
