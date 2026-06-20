import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Role } from '@legalflow/domain';

/** Cambios sobre un usuario del despacho: activar/desactivar, rol y tarifas (rate card). Solo FIRM_ADMIN. */
export class UpdateStaffDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn([Role.FIRM_ADMIN, Role.LAWYER])
  role?: Role.FIRM_ADMIN | Role.LAWYER;

  // Tarifas como decimal en texto (p. ej. "150.00"); cadena vacía "" = borrar la tarifa.
  @IsOptional()
  @IsString()
  @Matches(/^(\d{1,12}(\.\d{1,2})?)?$/, { message: 'billRate inválido' })
  billRate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{1,12}(\.\d{1,2})?)?$/, { message: 'costRate inválido' })
  costRate?: string;
}
