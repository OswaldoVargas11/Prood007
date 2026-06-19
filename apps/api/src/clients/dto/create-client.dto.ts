import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TaxIdKind } from '@legalflow/domain';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** Identificador fiscal (NIF/CIF/NIE en ES, RNC/Cédula en RD) o documento. Validado por el provider. */
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  taxId!: string;

  /**
   * Tipo de documento declarado. Si es PASSPORT u OTHER, se valida en ligero (clientes extranjeros);
   * si se omite, se asume documento fiscal y se valida estricto contra la jurisdicción del despacho.
   */
  @IsOptional()
  @IsEnum(TaxIdKind)
  docType?: TaxIdKind;

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
