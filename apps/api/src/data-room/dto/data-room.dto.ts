import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Alta de un data room en un expediente. */
export class CreateDataRoomDto {
  @IsString()
  matterId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;
}

/** Carpeta dentro del data room (estructura jerárquica opcional). */
export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

/** Vincula una versión existente del expediente al data room (espejo, sin duplicar bytes). */
export class LinkDocumentDto {
  @IsString()
  versionId!: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

/** Concede acceso externo (enlace mágico) a la contraparte/externo. */
export class CreateGrantDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;

  // Carpetas permitidas; vacío/omitido = todo el data room.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  folderIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

/** Respuesta del despacho a una pregunta de la sala (Q&A). */
export class AnswerQuestionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  answer!: string;
}

/** Pregunta hecha por un externo desde el enlace mágico (sin cuenta). */
export class AskQuestionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}
