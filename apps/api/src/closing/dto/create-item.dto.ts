import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ClosingItemCategory } from '@legalflow/domain';

/** Alta de una partida del checklist de cierre. */
export class CreateItemDto {
  @IsEnum(ClosingItemCategory)
  category!: ClosingItemCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

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
}
