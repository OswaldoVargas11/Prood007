import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreatePortalUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;
}
