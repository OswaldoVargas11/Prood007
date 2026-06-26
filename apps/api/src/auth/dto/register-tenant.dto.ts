import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, Jurisdiction } from '@legalflow/domain';

class AdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres.' })
  // Tope de 128 (igual que cambio/reset): acota el coste de argon2 y evita DoS por entradas enormes.
  @MaxLength(128, { message: 'La contraseña no puede superar los 128 caracteres.' })
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;
}

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  tenantName!: string;

  @IsEnum(Jurisdiction)
  jurisdiction!: Jurisdiction;

  @IsEnum(Currency)
  currency!: Currency;

  /** Identificador fiscal del despacho (para emitir facturas). */
  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @ValidateNested()
  @Type(() => AdminUserDto)
  admin!: AdminUserDto;
}
