import { IsNotEmpty, IsString } from 'class-validator';

/** Confirmación de email a partir del token del correo. */
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
