import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
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

  // Grupo de permisos al que se adscribe (opcional). Si se indica, hereda sus carpetas y descarga.
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;

  // Carpetas permitidas; vacío/omitido = hereda del grupo, o todo el data room si no hay grupo.
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

/** Grupo de permisos del data room (p. ej. "Comprador y asesores"). Los grants lo heredan. */
export class CreateGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  folderIds?: string[];

  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;
}

/** Edición de un grupo de permisos. */
export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  folderIds?: string[];

  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;
}

/** Edición del data room: renombrar, alternar marca de agua o abrir/cerrar la sala. */
export class UpdateDataRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: string;
}

/** Subida de un documento al data room (multipart): los campos viajan junto al fichero. */
export class UploadDataRoomDocumentDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
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
