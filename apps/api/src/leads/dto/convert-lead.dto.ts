import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TaxIdKind } from '@legalflow/domain';

/** Conversión de un lead en cliente (+ opcionalmente expediente). El documento es obligatorio para crear
 *  el cliente; `docType` PASSPORT/OTHER si no es fiscal. */
export class ConvertLeadDto {
  @IsString()
  @MinLength(5)
  @MaxLength(30)
  taxId!: string;

  @IsOptional()
  @IsEnum(TaxIdKind)
  docType?: TaxIdKind;

  @IsOptional()
  @IsBoolean()
  createMatter?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  matterTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  matterType?: string;
}
