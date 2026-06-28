import {
  IsBoolean,
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

  /** Domicilio fiscal del despacho (encabeza facturas e identifica a la parte en el DPA). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fiscalAddress?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  /**
   * Aceptación clickwrap de los documentos legales vigentes (ToS + Privacidad + DPA) en el alta. La UI lo
   * exige (casilla afirmativa). Cuando es true, el servidor registra la aceptación auditable con IP/UA.
   */
  @IsOptional()
  @IsBoolean()
  acceptLegal?: boolean;

  @ValidateNested()
  @Type(() => AdminUserDto)
  admin!: AdminUserDto;
}
