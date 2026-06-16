import { IsString, MaxLength, MinLength } from 'class-validator';

/** Aplica un token de restablecimiento con una nueva contraseña (misma política que el cambio). */
export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  @MaxLength(128, { message: 'La contraseña no puede superar los 128 caracteres.' })
  newPassword!: string;
}
