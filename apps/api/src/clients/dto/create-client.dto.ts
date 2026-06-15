import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** Identificador fiscal (NIF/CIF/NIE en ES, RNC/Cédula en RD). Validado por el provider. */
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  taxId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}
