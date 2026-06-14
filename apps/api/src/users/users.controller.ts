import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { UsersService } from './users.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/** Gestión de usuarios del despacho (staff). Solo el administrador del despacho. */
@Roles(Role.FIRM_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.users.listStaff(user);
  }

  @Get('seats')
  seats(@CurrentUser() user: RequestUser) {
    return this.users.seatUsage(user);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateStaffDto) {
    return this.users.createStaff(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.users.updateStaff(user, id, dto);
  }
}
