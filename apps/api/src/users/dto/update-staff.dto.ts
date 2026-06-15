import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Role } from '@legalflow/domain';

/** Cambios sobre un usuario del despacho: activar/desactivar y/o cambiar de rol. Solo FIRM_ADMIN. */
export class UpdateStaffDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn([Role.FIRM_ADMIN, Role.LAWYER])
  role?: Role.FIRM_ADMIN | Role.LAWYER;
}
