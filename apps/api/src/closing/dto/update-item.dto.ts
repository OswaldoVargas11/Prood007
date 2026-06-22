import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ClosingItemCategory, ClosingItemStatus } from '@legalflow/domain';

/**
 * Edición parcial de una partida. Todos los campos opcionales; `documentId`/`assigneeId`/`detail`/
 * `responsibleParty`/`dueDate` admiten cadena vacía para desvincular (el servicio la traduce a null).
 */
export class UpdateItemDto {
  @IsOptional()
  @IsEnum(ClosingItemCategory)
  category?: ClosingItemCategory;

  @IsOptional()
  @IsEnum(ClosingItemStatus)
  status?: ClosingItemStatus;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleParty?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
