import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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

/** Un paso de un workflow: invoca una herramienta del catálogo por nombre + input. */
export class WorkflowStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  tool!: string;

  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

/** Definición de un workflow agéntico multi-paso (crear/actualizar). */
export class WorkflowDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

/** Lanzar un workflow; `allowWrites` concede la confirmación HITL para los pasos de escritura. */
export class RunWorkflowDto {
  @IsOptional()
  @IsBoolean()
  allowWrites?: boolean;
}

/** Una columna de una revisión tabular: pregunta/atributo en lenguaje natural. */
export class TabularColumnDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  label!: string;
}

/**
 * Crear una revisión tabular: título + columnas + conjunto de documentos. El conjunto se define por UNA
 * de estas vías: `documentIds` (selección de documentos del expediente; requiere `matterId`),
 * `dataRoomFolderId` (una carpeta de data room) o `dataRoomId` (el data room completo).
 */
export class CreateTabularReviewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  matterId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TabularColumnDto)
  columns!: TabularColumnDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  dataRoomFolderId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  dataRoomId?: string;
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

/** Una regla de playbook: tema + posición del despacho (preferida/aceptables/deal-breakers). */
export class PlaybookRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  preferredText?: string;

  /** Cláusula de la biblioteca cuya redacción es la posición preferida (prioridad sobre preferredText). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  clauseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  acceptableText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  dealBreakers?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/** Crear un playbook de revisión con su juego de reglas. */
export class CreatePlaybookDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['es', 'do'])
  jurisdiction?: 'es' | 'do';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => PlaybookRuleDto)
  rules!: PlaybookRuleDto[];
}

/** Actualizar un playbook; si llegan `rules`, REEMPLAZAN el juego completo. */
export class UpdatePlaybookDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['es', 'do'])
  jurisdiction?: 'es' | 'do';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => PlaybookRuleDto)
  rules?: PlaybookRuleDto[];
}

/** Lanzar la revisión de un documento del expediente contra un playbook. */
export class CreatePlaybookReviewDto {
  @IsString()
  @MinLength(1)
  playbookId!: string;

  @IsString()
  @MinLength(1)
  documentId!: string;
}
