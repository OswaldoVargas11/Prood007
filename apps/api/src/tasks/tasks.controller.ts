import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role, TaskStatus } from '@legalflow/domain';
import { TasksService } from './tasks.service';
import { DeadlineRemindersService } from './deadline-reminders.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateTaskFromDeadlineDto, PreviewDeadlineDto } from './dto/create-task-from-deadline.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly reminders: DeadlineRemindersService,
  ) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  /**
   * "Recordar plazos ahora": dispara el avisador de plazos próximos para el despacho actual (como
   * `/dunning/run`). Útil para pruebas/operación; el cron diario lo hace para todos los tenants.
   */
  @Roles(Role.FIRM_ADMIN)
  @Post('run-reminders')
  runReminders(@CurrentUser() user: RequestUser) {
    return this.reminders.runForTenant(user);
  }

  /** Preview del plazo: calcula la fecha límite sin crear la tarea (para mostrarla en vivo). */
  @Post('deadline-preview')
  previewDeadline(@CurrentUser() user: RequestUser, @Body() dto: PreviewDeadlineDto) {
    return this.tasks.previewDeadline(user, dto);
  }

  /** Crea una tarea a partir de un plazo procesal calculado por el provider de la jurisdicción. */
  @Post('from-deadline')
  createFromDeadline(@CurrentUser() user: RequestUser, @Body() dto: CreateTaskFromDeadlineDto) {
    return this.tasks.createFromDeadline(user, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('matterId') matterId?: string,
    @Query('status') status?: TaskStatus,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.tasks.findAll(user, { matterId, status, assigneeId });
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tasks.remove(user, id);
  }
}
