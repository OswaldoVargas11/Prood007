import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de una plantilla de documento. El `body` admite marcadores {{campo}} (ver render.ts). */
export class CreateTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body!: string;

  /** Carpeta destino (sistema de ficheros de plantillas). Vacío/ausente = raíz. */
  @IsOptional()
  @IsString()
  folderId?: string;
}
