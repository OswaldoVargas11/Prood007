import { IsEmail } from 'class-validator';

/** Autoservicio "olvidé mi contraseña". Respuesta siempre genérica (no revela si el email existe). */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
