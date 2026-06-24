import { IsString, ValidateIf } from 'class-validator';

/** Mueve un documento a una carpeta (`folderId`) o a la raíz (`null`). */
export class MoveDocumentDto {
  @ValidateIf((o) => o.folderId !== null)
  @IsString()
  folderId!: string | null;
}
