import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { JudicialNotificationsController } from './judicial-notifications.controller';
import { JudicialNotificationsService } from './judicial-notifications.service';

@Module({
  imports: [TasksModule], // reutiliza TasksService para encadenar el plazo procesal
  controllers: [JudicialNotificationsController],
  providers: [JudicialNotificationsService],
})
export class JudicialNotificationsModule {}
