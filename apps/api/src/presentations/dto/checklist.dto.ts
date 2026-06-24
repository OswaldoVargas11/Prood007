import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ChecklistItemStatus } from '@legalflow/domain';

/** Aplica un tipo de presentación a un expediente (instancia la checklist). */
export class ApplyChecklistDto {
  @IsString()
  matterId!: string;

  @IsString()
  presentationTypeId!: string;
}

/** Actualiza un ítem de la checklist: estado y/o documento aportado (`null` para desvincular). */
export class UpdateChecklistItemDto {
  @IsOptional()
  @IsEnum(ChecklistItemStatus)
  status?: ChecklistItemStatus;

  @ValidateIf((o) => o.documentId !== null && o.documentId !== undefined)
  @IsString()
  documentId?: string | null;
}
