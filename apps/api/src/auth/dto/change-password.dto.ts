import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Cambio de contraseña self-service: exige la contraseña actual (re-autenticación) y una nueva.
 * Política: mínimo 10 caracteres (igual que el alta de usuarios) y tope de 128 para acotar el coste
 * de argon2 (evita DoS por entradas enormes). El "no repetir la actual" se valida en el servicio.
 */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede superar los 128 caracteres.' })
  newPassword!: string;
}
