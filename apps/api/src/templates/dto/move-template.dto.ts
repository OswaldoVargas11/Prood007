import { IsString, ValidateIf } from 'class-validator';

/** Mueve una plantilla a una carpeta (`folderId`) o a la raíz (`null`). */
export class MoveTemplateDto {
  @ValidateIf((o) => o.folderId !== null)
  @IsString()
  folderId!: string | null;
}
