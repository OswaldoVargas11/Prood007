import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Edición de la cabecera del checklist: título y calendario de la operación — firma (signing),
 * consumación (closing) y fecha límite (longstop/drop-dead). Días naturales, no es un plazo procesal.
 */
export class UpdateChecklistDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsISO8601()
  signingDate?: string;

  @IsOptional()
  @IsISO8601()
  closingDate?: string;

  @IsOptional()
  @IsISO8601()
  longstopDate?: string;
}
