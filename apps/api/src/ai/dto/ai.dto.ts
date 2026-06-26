import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';

/** Pregunta libre sobre un expediente. */
export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  question!: string;
}

/** Generar un borrador a partir de una plantilla, anclado a un expediente. */
export class DraftFromTemplateDto {
  @IsString()
  @MinLength(1)
  matterId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}

/** Redactar un correo; el expediente es opcional (da contexto). */
export class DraftEmailDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  instructions!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  matterId?: string;
}

/** Petición al asistente agéntico (tool-use): un mensaje en lenguaje natural sobre el despacho. */
export class AgentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;
}

/** Búsqueda semántica. */
export class SemanticSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
