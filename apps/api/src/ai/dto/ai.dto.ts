import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  MinLength,
  ValidateNested,
} from 'class-validator';

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

/** Un turno previo de la conversación (texto plano) para el modo multi-turno del asistente. */
export class AgentMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content!: string;
}

/** Petición al asistente agéntico (tool-use): un mensaje + el historial previo (conversación multi-turno). */
export class AgentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AgentMessageDto)
  history?: AgentMessageDto[];

  /** Concede permiso para EJECUTAR las acciones de escritura propuestas (confirmación humana, HITL). */
  @IsOptional()
  @IsBoolean()
  allowWrites?: boolean;
}

/** Un turno a PERSISTIR en una conversación con Zora (texto + UI rica opcional en `meta`). */
export class SaveTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(16000)
  content!: string;

  /** Tarjetas de herramientas + traza para restaurar la UI (solo mensajes del asistente). */
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

/** Guardar un turno completo (1-2 mensajes: el del usuario y la respuesta del asistente). */
export class SaveTurnsDto {
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => SaveTurnDto)
  messages!: SaveTurnDto[];
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
