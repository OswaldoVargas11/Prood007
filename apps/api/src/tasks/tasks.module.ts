import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DeadlineRemindersService } from './deadline-reminders.service';
import { DeadlinesCron } from './deadlines.cron';

/**
 * Tareas y plazos. Incluye el avisador de plazos próximos (`DeadlineRemindersService`) y su cron
 * diario multi-tenant (`DeadlinesCron`, descubierto por `ScheduleModule.forRoot()` en `app.module`).
 */
@Module({
  controllers: [TasksController],
  providers: [TasksService, DeadlineRemindersService, DeadlinesCron],
  exports: [TasksService, DeadlineRemindersService],
})
export class TasksModule {}
