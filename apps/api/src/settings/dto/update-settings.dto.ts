import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Cambios sobre los datos del despacho. Solo FIRM_ADMIN. */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  /** Identificador fiscal del despacho (se valida contra la jurisdicción). */
  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
