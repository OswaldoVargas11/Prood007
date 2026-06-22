import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Edición de la cabecera del checklist (título y fecha objetivo de cierre). */
export class UpdateChecklistDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsISO8601()
  closingDate?: string;
}
