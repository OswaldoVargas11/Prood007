import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Abrir (o reutilizar) una conversación directa 1:1 con otro usuario del despacho. */
export class OpenDirectDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

/** Crear un mensaje en una conversación (DM o canal). */
export class CreateChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  /** Documento adjunto (opcional). */
  @IsOptional()
  @IsString()
  attachmentDocumentId?: string;
}

/** Alterna una reacción emoji del usuario sobre un mensaje. */
export class ChatReactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}
