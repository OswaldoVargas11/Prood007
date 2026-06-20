import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Segundo paso del login: token de desafío + código (TOTP de 6 dígitos o de respaldo). */
export class MfaLoginDto {
  @IsString()
  @IsNotEmpty()
  mfaToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;
}

/** Confirmación con un código (activar/desactivar MFA). */
export class MfaCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;
}
