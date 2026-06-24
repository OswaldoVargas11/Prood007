import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  matterId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  /** Carpeta destino (sistema de ficheros del expediente). Vacío/ausente = raíz. */
  @IsOptional()
  @IsString()
  folderId?: string;
}
