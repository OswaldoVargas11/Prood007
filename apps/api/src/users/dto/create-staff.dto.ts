import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '@legalflow/domain';

/** Alta de un usuario del despacho (letrado o administrador). Solo FIRM_ADMIN. */
export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  password!: string;

  /** Rol del staff: administrador o letrado (nunca CLIENT por esta vía). */
  @IsIn([Role.FIRM_ADMIN, Role.LAWYER])
  role!: Role.FIRM_ADMIN | Role.LAWYER;
}
