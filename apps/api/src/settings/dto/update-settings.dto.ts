import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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

  /** Serie fiscal: prefijo de la numeración de facturas (alfanumérico). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,10}$/, { message: 'La serie debe ser alfanumérica (máx. 10).' })
  invoiceSeries?: string;

  /** RGPD/172-13 — residencia de datos (p. ej. "EU"). Metadato de gobernanza (D-022). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dataRegion?: string;

  /** RGPD/172-13 — política de conservación en meses (0 = sin límite explícito). No auto-purga. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1200)
  retentionMonths?: number;
}
