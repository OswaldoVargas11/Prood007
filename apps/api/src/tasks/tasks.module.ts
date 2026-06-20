import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { DeadlineRemindersService } from './deadline-reminders.service';
import { DeadlinesCron } from './deadlines.cron';
import { AuthModule } from '../auth/auth.module';

/**
 * Tareas y plazos. Incluye el avisador de plazos próximos (`DeadlineRemindersService`) y su cron
 * diario multi-tenant (`DeadlinesCron`, descubierto por `ScheduleModule.forRoot()` en `app.module`).
 * Importa AuthModule por el proveedor de correo (`MAIL_PROVIDER`) del canal email de recordatorios.
 */
@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, DeadlineRemindersService, DeadlinesCron],
  exports: [TasksService, DeadlineRemindersService],
})
export class TasksModule {}
