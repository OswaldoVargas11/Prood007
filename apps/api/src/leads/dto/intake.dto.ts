import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Formulario PÚBLICO de captación (intake). Lo rellena un prospecto desde el enlace del despacho. */
export class IntakeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  subject?: string;
}
